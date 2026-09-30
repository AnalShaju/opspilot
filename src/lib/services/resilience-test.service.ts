/**
 * Resilience Tester.
 *
 * Runs ONE controlled failure through the EXISTING incident workflow:
 *
 *   trigger scenario (public simulator API) -> detect open incident
 *   -> create incident -> incident investigation (evidence + history + ONE
 *   DeepSeek call) -> human approval -> deterministic remediation
 *   -> health verification -> result
 *
 * There is no second AI path. This service never calls DeepSeek and never
 * executes remediation itself; it only records what the incident workflow did.
 * Every value on the test is derived from real execution.
 */

import {
  getResilienceTestRepository,
  type ResilienceTestRepository,
} from "@/lib/repositories";
import {
  createIncident,
  getIncidentById,
  investigateIncidentWithAi,
} from "@/lib/incidents/incidentService";
import { logEvent } from "@/lib/logging";
import {
  RESILIENCE_SCENARIOS,
  getScenario,
} from "@/lib/resilience/scenarios";
import {
  getPreviousIncidents,
  resetSimulator,
  simulateScenario,
  verifyHealth,
} from "@/lib/tools";
import type {
  CreateIncidentInput,
  Incident,
  IncidentSeverity,
} from "@/lib/types/incident";
import {
  ResilienceTestError,
  type ResilienceScenarioDefinition,
  type ResilienceTest,
} from "@/lib/types/resilience";
import type {
  SimulatorHealth,
  SimulatorPreviousIncident,
} from "@/lib/types/simulator";

export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];

// ---------------------------------------------------------------------------
// Pure derivation: incident record -> resilience test stages
// ---------------------------------------------------------------------------

function terminal(test: ResilienceTest): boolean {
  return test.overallStatus !== "running";
}

function skipRemaining(test: ResilienceTest): void {
  if (test.investigationStatus === "pending") test.investigationStatus = "skipped";
  if (test.recommendationStatus === "pending") test.recommendationStatus = "skipped";
  if (test.approvalStatus === "pending") test.approvalStatus = "skipped";
  if (test.remediationStatus === "pending") test.remediationStatus = "skipped";
  if (test.verificationStatus === "pending") test.verificationStatus = "skipped";
  // Anything still "in progress" when the run ends did not complete.
  for (const key of [
    "investigationStatus",
    "recommendationStatus",
    "approvalStatus",
    "remediationStatus",
    "verificationStatus",
  ] as const) {
    if (test[key] === "in_progress") test[key] = "skipped";
  }
}

function finish(
  test: ResilienceTest,
  overall: ResilienceTest["overallStatus"],
  completedAt: string,
  failureReason: string | null,
): void {
  test.overallStatus = overall;
  test.completedAt = completedAt;
  test.failureReason = failureReason;
}

/**
 * Derive the current test state from the linked incident.
 * Pure (no I/O): returns a new object, never mutates its input.
 */
export function deriveTestFromIncident(
  test: ResilienceTest,
  incident: Incident | undefined,
  nowMs: number,
): ResilienceTest {
  if (terminal(test) || !incident) return test;

  const next: ResilienceTest = structuredClone(test);
  const nowIso = new Date(nowMs).toISOString();
  const { recommendedAction: rec, approval, recovery } = incident;

  // --- Investigation + recommendation -------------------------------------
  const investigated = !!incident.rootCause && !!rec;

  if (incident.status === "investigation_failed") {
    next.investigationStatus = "failed";
    next.recommendationStatus = "skipped";
    skipRemaining(next);
    finish(
      next,
      "failed",
      incident.investigation?.completedAt ?? nowIso,
      `Investigation failed: ${incident.investigation?.error ?? "unknown error"}`,
    );
  } else if (investigated) {
    next.investigationStatus = "passed";
    next.recommendationStatus = "passed";
    next.investigationCompletedAt =
      incident.investigation?.completedAt ?? next.investigationCompletedAt;
    next.rootCauseSummary = incident.rootCause?.summary ?? null;
    next.confidence = incident.rootCause?.confidence ?? null;
    next.recommendedActionType = rec?.type ?? null;
    next.recommendedActionTarget = rec?.target ?? null;
  } else {
    next.investigationStatus = "in_progress";
  }

  // --- Approval -----------------------------------------------------------
  if (!terminal(next) && investigated) {
    if (approval?.approved === true) {
      next.approvalStatus = "passed";
      next.approvedAt = approval.approvedAt;
    } else if (approval?.approved === false) {
      next.approvalStatus = "failed";
      next.approvedAt = null;
      skipRemaining(next);
      finish(next, "cancelled", approval.approvedAt, "Human approval was declined");
    } else {
      next.approvalStatus = "in_progress";
      const waitingSince = Date.parse(
        next.investigationCompletedAt ?? next.detectedAt ?? next.startedAt,
      );
      if (
        Number.isFinite(waitingSince) &&
        nowMs - waitingSince > next.approvalTimeoutMs
      ) {
        next.approvalStatus = "failed";
        skipRemaining(next);
        finish(
          next,
          "failed",
          nowIso,
          `Human approval timed out after ${Math.round(next.approvalTimeoutMs / 60000)} minute(s)`,
        );
      }
    }
  }

  // --- Remediation --------------------------------------------------------
  if (!terminal(next) && recovery) {
    if (recovery.executed === true) {
      next.remediationStatus = "passed";
      next.remediatedAt = recovery.executedAt;
      next.remediationResult = recovery.result;
    } else if (recovery.executed === false) {
      next.remediationStatus = "failed";
      next.remediationResult = recovery.result;
      skipRemaining(next);
      finish(
        next,
        "failed",
        recovery.executedAt,
        `Remediation failed: ${recovery.result}`,
      );
    }
  } else if (
    !terminal(next) &&
    (incident.status === "remediating" || incident.status === "verifying")
  ) {
    next.remediationStatus = "in_progress";
  }

  // --- Verification -------------------------------------------------------
  if (!terminal(next) && recovery?.executed === true) {
    if (recovery.verified === true) {
      const verifiedAt = recovery.verifiedAt ?? nowIso;
      next.verificationStatus = "passed";
      next.verifiedAt = verifiedAt;
      next.verificationResult = `${incident.service} recovered; health verification passed`;
      const triggered = Date.parse(next.triggeredAt ?? next.startedAt);
      const verified = Date.parse(verifiedAt);
      next.recoveryDurationMs =
        Number.isFinite(triggered) && Number.isFinite(verified)
          ? Math.max(0, verified - triggered)
          : null;
      finish(next, "passed", verifiedAt, null);
    } else if (recovery.verified === false) {
      const verifiedAt = recovery.verifiedAt ?? nowIso;
      next.verificationStatus = "failed";
      next.verifiedAt = verifiedAt;
      next.verificationResult = "Health verification failed: service still unhealthy";
      finish(
        next,
        "failed",
        verifiedAt,
        "Verification failed: the service did not recover after remediation",
      );
    } else {
      next.verificationStatus = "in_progress";
    }
  }

  // --- Evaluation (grading only) -----------------------------------------
  next.evaluation.actualIncidentType = incident.incidentType ?? null;
  next.evaluation.actualActionType = rec?.type ?? null;
  next.evaluation.incidentTypeMatched =
    next.evaluation.actualIncidentType === null
      ? null
      : next.evaluation.actualIncidentType ===
        next.evaluation.expectedIncidentType;
  next.evaluation.actionTypeMatched =
    next.evaluation.actualActionType === null
      ? null
      : next.evaluation.actualActionType === next.evaluation.expectedActionType;

  return next;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ResilienceDependencies {
  repository: () => ResilienceTestRepository;
  simulator: {
    reset: () => Promise<void>;
    simulateScenario: (scenarioId: string) => Promise<unknown>;
    getSimulatorIncidents: () => Promise<SimulatorPreviousIncident[]>;
    getHealth: () => Promise<SimulatorHealth>;
  };
  incidents: {
    create: (input: CreateIncidentInput) => Incident;
    get: (id: string) => Incident | undefined;
    /** Existing investigation pipeline (evidence -> history -> ONE AI call). */
    investigate: (id: string) => Promise<unknown>;
  };
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  detection: { attempts: number; intervalMs: number };
}

const defaultDependencies: ResilienceDependencies = {
  repository: getResilienceTestRepository,
  simulator: {
    reset: resetSimulator,
    simulateScenario,
    getSimulatorIncidents: getPreviousIncidents,
    getHealth: verifyHealth,
  },
  incidents: {
    create: createIncident,
    get: getIncidentById,
    investigate: investigateIncidentWithAi,
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  detection: { attempts: 10, intervalMs: 500 },
};

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  return error.message.includes("unavailable")
    ? "the simulator is unavailable"
    : error.message;
}

function describeUnhealthyServices(health: SimulatorHealth | null): string | null {
  const entries = Object.entries(health?.services ?? {}).filter(
    ([, state]) => String(state).toLowerCase() !== "healthy",
  );
  if (entries.length === 0) return null;
  return entries.map(([name, state]) => `${name} ${state}`).join(", ");
}

export interface ResilienceTestService {
  listScenarios(): readonly ResilienceScenarioDefinition[];
  startTest(scenarioId: string): Promise<ResilienceTest>;
  getTest(testId: string): Promise<ResilienceTest>;
  listTests(limit?: number): Promise<ResilienceTest[]>;
  cancelTest(testId: string): Promise<ResilienceTest>;
}

export function createResilienceTestService(
  overrides: Partial<ResilienceDependencies> = {},
): ResilienceTestService {
  const deps: ResilienceDependencies = { ...defaultDependencies, ...overrides };

  async function refresh(test: ResilienceTest): Promise<ResilienceTest> {
    if (terminal(test) || !test.incidentId) return test;
    const derived = deriveTestFromIncident(
      test,
      deps.incidents.get(test.incidentId),
      deps.now(),
    );
    if (JSON.stringify(derived) === JSON.stringify(test)) return test;
    const saved = await deps.repository().saveTest(derived);
    if (terminal(saved)) {
      logEvent("RESILIENCE_TEST_FINISHED", {
        testId: saved.testId,
        overallStatus: saved.overallStatus,
        recoveryDurationMs: saved.recoveryDurationMs,
      });
    }
    return saved;
  }

  async function failTest(
    test: ResilienceTest,
    reason: string,
    stage: "detectionStatus" | "investigationStatus",
  ): Promise<ResilienceTest> {
    const failed = structuredClone(test);
    failed[stage] = "failed";
    skipRemaining(failed);
    finish(failed, "failed", new Date(deps.now()).toISOString(), reason);
    logEvent("RESILIENCE_TEST_FAILED", { testId: test.testId, reason });
    return deps.repository().saveTest(failed);
  }

  async function detectOpenIncident(
    scenarioId: string,
  ): Promise<SimulatorPreviousIncident | null> {
    for (let attempt = 0; attempt < deps.detection.attempts; attempt += 1) {
      const incidents = await deps.simulator.getSimulatorIncidents();
      const open = incidents.filter((item) => item.status === "open");
      const match = open.find((item) => item.scenario === scenarioId) ?? open[0];
      if (match) return match;
      if (attempt < deps.detection.attempts - 1) {
        await deps.sleep(deps.detection.intervalMs);
      }
    }
    return null;
  }

  async function getTest(testId: string): Promise<ResilienceTest> {
    const found = await deps.repository().getTestById(testId);
    if (!found) {
      throw new ResilienceTestError(`Resilience test not found: ${testId}`, 404);
    }
    return refresh(found);
  }

  return {
    listScenarios: () => RESILIENCE_SCENARIOS,

    getTest,

    async startTest(scenarioId) {
      const scenario = getScenario(scenarioId);
      if (!scenario) {
        throw new ResilienceTestError(
          `Unknown scenario: ${scenarioId}. Use one of: ${RESILIENCE_SCENARIOS.map((s) => s.id).join(", ")}`,
          400,
        );
      }

      const repository = deps.repository();

      // Only one test may own the simulator at a time.
      const running = await repository.findRunningTest();
      if (running) {
        const current = await refresh(running);
        if (!terminal(current)) {
          throw new ResilienceTestError(
            `Resilience test ${current.testId} is still in progress. Finish or cancel it first.`,
            409,
          );
        }
      }

      const startedAt = new Date(deps.now()).toISOString();
      let test: ResilienceTest = await repository.saveTest({
        testId: await repository.nextTestId(),
        scenario: scenario.id,
        scenarioName: scenario.name,
        startedAt,
        completedAt: null,
        incidentId: null,
        detectionStatus: "in_progress",
        investigationStatus: "pending",
        recommendationStatus: "pending",
        approvalStatus: "pending",
        remediationStatus: "pending",
        verificationStatus: "pending",
        overallStatus: "running",
        recoveryDurationMs: null,
        failureReason: null,
        triggeredAt: null,
        detectedAt: null,
        investigationCompletedAt: null,
        approvedAt: null,
        remediatedAt: null,
        verifiedAt: null,
        rootCauseSummary: null,
        confidence: null,
        recommendedActionType: null,
        recommendedActionTarget: null,
        remediationResult: null,
        verificationResult: null,
        evaluation: {
          expectedIncidentType: scenario.expectedIncidentType,
          expectedActionType: scenario.expectedActionType,
          actualIncidentType: null,
          actualActionType: null,
          incidentTypeMatched: null,
          actionTypeMatched: null,
        },
        approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      });

      logEvent("RESILIENCE_TEST_STARTED", {
        testId: test.testId,
        scenario: scenario.id,
      });

      // STEP 2: controlled failure via the simulator's PUBLIC scenario APIs.
      try {
        await deps.simulator.reset();
        await deps.simulator.simulateScenario(scenario.id);
      } catch (error) {
        return failTest(
          test,
          `Scenario trigger failed: ${describeFailure(error)}`,
          "detectionStatus",
        );
      }
      test = await repository.saveTest({
        ...test,
        triggeredAt: new Date(deps.now()).toISOString(),
      });

      // STEP 3: detect the resulting incident (polling the simulator only —
      // no AI is used for detection).
      let detected: SimulatorPreviousIncident | null;
      let health: SimulatorHealth | null = null;
      try {
        detected = await detectOpenIncident(scenario.id);
        health = await deps.simulator.getHealth().catch(() => null);
      } catch (error) {
        return failTest(
          test,
          `Simulator unavailable while detecting the incident: ${describeFailure(error)}`,
          "detectionStatus",
        );
      }

      if (!detected) {
        return failTest(
          test,
          "Incident not detected: the simulator reported no open incident after the failure was triggered",
          "detectionStatus",
        );
      }

      // STEP 4: hand off to the EXISTING incident workflow.
      const severity = SEVERITIES.includes(detected.severity as IncidentSeverity)
        ? (detected.severity as IncidentSeverity)
        : "high";
      const title = detected.title ?? scenario.name;
      const incident = deps.incidents.create({
        service: detected.service ?? "Unknown service",
        title,
        description: describeUnhealthyServices(health) ?? title,
        severity,
        source: "resilience_test",
        scenarioId: scenario.id,
        resilienceTestId: test.testId,
      });

      test = await repository.saveTest({
        ...test,
        incidentId: incident.id,
        detectionStatus: "passed",
        detectedAt: new Date(deps.now()).toISOString(),
        investigationStatus: "in_progress",
      });

      // Investigation runs in the background; the test page polls getTest().
      // Failures are reflected on the incident (investigation_failed) and then
      // derived onto this test.
      void deps.incidents.investigate(incident.id).catch((error: unknown) => {
        logEvent("RESILIENCE_INVESTIGATION_FAILED", {
          testId: test.testId,
          incidentId: incident.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      });

      return test;
    },

    async listTests(limit) {
      const tests = await deps.repository().listTests(limit);
      return Promise.all(tests.map((test) => refresh(test)));
    },

    async cancelTest(testId) {
      const current = await getTest(testId);
      if (terminal(current)) return current;

      const cancelled = structuredClone(current);
      skipRemaining(cancelled);
      if (cancelled.detectionStatus === "in_progress") {
        cancelled.detectionStatus = "skipped";
      }
      finish(
        cancelled,
        "cancelled",
        new Date(deps.now()).toISOString(),
        "Cancelled by user",
      );
      logEvent("RESILIENCE_TEST_CANCELLED", { testId });
      return deps.repository().saveTest(cancelled);
    },
  };
}

/** Default service bound to the real incident workflow and simulator. */
export const resilienceTestService = createResilienceTestService();
