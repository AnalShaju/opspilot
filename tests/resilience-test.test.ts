import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { InMemoryResilienceTestRepository } from "@/lib/repositories/resilience-test.repository";
import {
  createResilienceTestService,
  deriveTestFromIncident,
  type ResilienceDependencies,
} from "@/lib/services/resilience-test.service";
import type { CreateIncidentInput, Incident } from "@/lib/types/incident";
import {
  ResilienceTestError,
  type ResilienceTest,
} from "@/lib/types/resilience";
import type { SimulatorPreviousIncident } from "@/lib/types/simulator";
import { makeIncident } from "@tests/helpers";

const T0 = Date.parse("2026-09-30T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const OPEN_REDIS: SimulatorPreviousIncident = {
  id: "INC-001",
  scenario: "ORDERS_REDIS_FAILURE",
  service: "Orders Service",
  title: "Orders Service Redis Failover Impact",
  severity: "high",
  status: "open",
};

function harness(options?: {
  incidents?: SimulatorPreviousIncident[];
  failSimulate?: boolean;
  attempts?: number;
}) {
  const repository = new InMemoryResilienceTestRepository();
  const store = new Map<string, Incident>();
  const calls = {
    reset: 0,
    simulate: [] as string[],
    investigate: [] as string[],
    created: [] as CreateIncidentInput[],
    sleeps: 0,
  };
  let clock = T0;

  const deps: Partial<ResilienceDependencies> = {
    repository: () => repository,
    simulator: {
      reset: async () => {
        calls.reset += 1;
      },
      simulateScenario: async (id: string) => {
        if (options?.failSimulate) throw new Error("Simulator unavailable");
        calls.simulate.push(id);
        return { success: true };
      },
      getSimulatorIncidents: async () => options?.incidents ?? [OPEN_REDIS],
      getHealth: async () => ({
        recovered: false,
        activeScenario: "ORDERS_REDIS_FAILURE",
        services: { "Orders Service": "degraded", Redis: "unhealthy" },
      }),
    },
    incidents: {
      create: async (input) => {
        calls.created.push(input);
        const incident: Incident = {
          id: "INC-T1",
          code: "INC-T1",
          ...input,
          status: "detected",
          createdAt: iso(clock),
          updatedAt: iso(clock),
        };
        store.set(incident.id, incident);
        return incident;
      },
      get: async (id) => store.get(id),
      investigate: async (id) => {
        calls.investigate.push(id);
      },
    },
    now: () => clock,
    sleep: async () => {
      calls.sleeps += 1;
    },
    detection: { attempts: options?.attempts ?? 3, intervalMs: 1 },
  };

  return {
    service: createResilienceTestService(deps),
    repository,
    store,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

/** Apply a patch to the stored incident, like the real workflow would. */
function patchIncident(
  store: Map<string, Incident>,
  patch: Partial<Incident>,
): void {
  const current = store.get("INC-T1");
  assert.ok(current);
  store.set("INC-T1", { ...current, ...patch });
}

const investigated: Partial<Incident> = {
  status: "awaiting_approval",
  incidentType: "cache_failure",
  rootCause: {
    summary: "Redis is down, degrading Orders Service",
    confidence: 0.91,
    evidence: ["Redis status unhealthy"],
  },
  recommendedAction: makeIncident().recommendedAction,
  investigation: {
    startedAt: iso(T0),
    completedAt: iso(T0 + 8_000),
    aiCallCount: 1,
  },
};

describe("resilience test: triggering and detection", () => {
  test("can trigger a scenario through the public simulator APIs", async () => {
    const h = harness();

    const test = await h.service.startTest("ORDERS_REDIS_FAILURE");

    assert.equal(h.calls.reset, 1, "starts from a clean baseline via /reset");
    assert.deepEqual(h.calls.simulate, ["ORDERS_REDIS_FAILURE"]);
    assert.equal(test.scenario, "ORDERS_REDIS_FAILURE");
    assert.equal(test.overallStatus, "running");
    assert.equal(test.detectionStatus, "passed");
    assert.equal(test.investigationStatus, "in_progress");
    assert.ok(test.triggeredAt && test.detectedAt);
    assert.equal(test.incidentId, "INC-T1");
  });

  test("hands the detected incident to the EXISTING investigation pipeline once", async () => {
    const h = harness();

    await h.service.startTest("ORDERS_REDIS_FAILURE");

    assert.deepEqual(h.calls.investigate, ["INC-T1"]);
    const created = h.calls.created[0];
    assert.equal(created.service, "Orders Service", "taken from the simulator");
    assert.equal(created.source, "resilience_test");
    assert.equal(created.scenarioId, "ORDERS_REDIS_FAILURE");
    assert.equal(created.description, "Orders Service degraded, Redis unhealthy");
  });

  test("does not hardcode a root cause or fix into the incident", async () => {
    const h = harness();

    await h.service.startTest("ORDERS_REDIS_FAILURE");

    const incident = h.store.get("INC-T1");
    assert.ok(incident);
    assert.equal(incident.rootCause, undefined);
    assert.equal(incident.recommendedAction, undefined);
    assert.equal(incident.incidentType, undefined);
  });

  test("rejects unknown scenarios", async () => {
    const h = harness();

    await assert.rejects(
      () => h.service.startTest("NOT_A_SCENARIO"),
      (error: unknown) =>
        error instanceof ResilienceTestError && error.status === 400,
    );
    assert.equal(h.calls.reset, 0);
  });

  test("scenario trigger failure produces a failed test with a useful reason", async () => {
    const h = harness({ failSimulate: true });

    const test = await h.service.startTest("ORDERS_REDIS_FAILURE");

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.detectionStatus, "failed");
    assert.match(test.failureReason ?? "", /Scenario trigger failed/);
    assert.match(test.failureReason ?? "", /unavailable/);
    assert.equal(test.investigationStatus, "skipped");
    assert.ok(test.completedAt);
    assert.equal(h.calls.investigate.length, 0);
  });

  test("incident not detected produces a failed test", async () => {
    const h = harness({ incidents: [], attempts: 3 });

    const test = await h.service.startTest("ORDERS_REDIS_FAILURE");

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.detectionStatus, "failed");
    assert.match(test.failureReason ?? "", /not detected/i);
    assert.equal(h.calls.sleeps, 2, "polls, sleeping between attempts only");
    assert.equal(h.calls.investigate.length, 0);
  });

  test("only one test may run at a time", async () => {
    const h = harness();
    await h.service.startTest("ORDERS_REDIS_FAILURE");

    await assert.rejects(
      () => h.service.startTest("USERS_AUTH_DEPLOYMENT"),
      (error: unknown) =>
        error instanceof ResilienceTestError && error.status === 409,
    );
  });

  test("a new test can start once the previous one has finished", async () => {
    const h = harness();
    const first = await h.service.startTest("ORDERS_REDIS_FAILURE");
    await h.service.cancelTest(first.testId);

    const second = await h.service.startTest("ORDERS_REDIS_FAILURE");

    assert.notEqual(second.testId, first.testId);
  });
});

describe("resilience test: recording each stage from real execution", () => {
  test("records every stage as the incident progresses, then PASSED", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    const id = started.testId;

    // Investigation running.
    let test = await h.service.getTest(id);
    assert.equal(test.investigationStatus, "in_progress");
    assert.equal(test.approvalStatus, "pending");

    // Investigation done: waiting for a human.
    h.advance(8_000);
    patchIncident(h.store, investigated);
    test = await h.service.getTest(id);
    assert.equal(test.investigationStatus, "passed");
    assert.equal(test.recommendationStatus, "passed");
    assert.equal(test.recommendedActionType, "restart_redis");
    assert.equal(test.rootCauseSummary, "Redis is down, degrading Orders Service");
    assert.equal(test.confidence, 0.91);
    assert.equal(test.approvalStatus, "in_progress");
    assert.equal(test.overallStatus, "running");

    // Human approved, remediation running.
    h.advance(20_000);
    patchIncident(h.store, {
      status: "remediating",
      approval: {
        approved: true,
        approvedAt: iso(h.now()),
        approvedBy: "human",
      },
    });
    test = await h.service.getTest(id);
    assert.equal(test.approvalStatus, "passed");
    assert.equal(test.approvedAt, iso(h.now()));
    assert.equal(test.remediationStatus, "in_progress");

    // Remediation executed, verifying.
    h.advance(1_000);
    patchIncident(h.store, {
      status: "verifying",
      recovery: {
        action: "restart_redis",
        target: "Redis",
        executed: true,
        executedAt: iso(h.now()),
        result: "Redis restarted and Orders Service recovered",
      },
    });
    test = await h.service.getTest(id);
    assert.equal(test.remediationStatus, "passed");
    assert.equal(test.remediationResult, "Redis restarted and Orders Service recovered");
    assert.equal(test.verificationStatus, "in_progress");
    assert.equal(test.overallStatus, "running");

    // Verified recovery.
    h.advance(1_000);
    const executed = h.store.get("INC-T1")?.recovery;
    assert.ok(executed);
    patchIncident(h.store, {
      status: "resolved",
      recovery: { ...executed, verified: true, verifiedAt: iso(h.now()) },
    });
    test = await h.service.getTest(id);

    assert.equal(test.verificationStatus, "passed");
    assert.equal(test.overallStatus, "passed");
    assert.equal(test.failureReason, null);
    assert.equal(test.completedAt, iso(h.now()));
    // Calculated from real timestamps: failure injected -> recovery verified.
    assert.equal(test.recoveryDurationMs, h.now() - T0);
    assert.equal(test.recoveryDurationMs, 30_000);
    assert.equal(test.evaluation.incidentTypeMatched, true);
    assert.equal(test.evaluation.actionTypeMatched, true);
  });

  test("failed verification produces FAILED", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    patchIncident(h.store, {
      ...investigated,
      status: "failed",
      approval: { approved: true, approvedAt: iso(T0 + 1_000) },
      recovery: {
        action: "restart_redis",
        target: "Redis",
        executed: true,
        executedAt: iso(T0 + 2_000),
        result: "Redis restarted",
        verified: false,
        verifiedAt: iso(T0 + 3_000),
      },
    });

    const test = await h.service.getTest(started.testId);

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.remediationStatus, "passed");
    assert.equal(test.verificationStatus, "failed");
    assert.match(test.failureReason ?? "", /Verification failed/);
    assert.equal(test.recoveryDurationMs, null, "no fake recovery time");
    assert.equal(test.completedAt, iso(T0 + 3_000));
  });

  test("remediation failure produces FAILED and skips verification", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    patchIncident(h.store, {
      ...investigated,
      status: "failed",
      approval: { approved: true, approvedAt: iso(T0 + 1_000) },
      recovery: {
        action: "restart_redis",
        target: "Redis",
        executed: false,
        executedAt: iso(T0 + 2_000),
        result: "Simulator request failed (400)",
      },
    });

    const test = await h.service.getTest(started.testId);

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.remediationStatus, "failed");
    assert.equal(test.verificationStatus, "skipped");
    assert.match(test.failureReason ?? "", /Remediation failed/);
  });

  test("investigation failure (e.g. DeepSeek error) produces FAILED", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    patchIncident(h.store, {
      status: "investigation_failed",
      investigation: {
        startedAt: iso(T0),
        completedAt: iso(T0 + 4_000),
        error: "DeepSeek request failed (500)",
      },
    });

    const test = await h.service.getTest(started.testId);

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.investigationStatus, "failed");
    assert.match(test.failureReason ?? "", /Investigation failed: DeepSeek/);
    assert.equal(test.approvalStatus, "skipped");
  });

  test("declined approval cancels the test", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    patchIncident(h.store, {
      ...investigated,
      status: "failed",
      approval: { approved: false, approvedAt: iso(T0 + 9_000) },
    });

    const test = await h.service.getTest(started.testId);

    assert.equal(test.overallStatus, "cancelled");
    assert.equal(test.approvalStatus, "failed");
    assert.equal(test.remediationStatus, "skipped");
    assert.match(test.failureReason ?? "", /declined/);
  });

  test("approval timeout fails the test", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    patchIncident(h.store, investigated);
    assert.equal(
      (await h.service.getTest(started.testId)).approvalStatus,
      "in_progress",
    );

    h.advance(started.approvalTimeoutMs + 60_000);
    const test = await h.service.getTest(started.testId);

    assert.equal(test.overallStatus, "failed");
    assert.equal(test.approvalStatus, "failed");
    assert.match(test.failureReason ?? "", /timed out/);
  });

  test("cancelling stops the test", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");

    const test = await h.service.cancelTest(started.testId);

    assert.equal(test.overallStatus, "cancelled");
    assert.equal(test.failureReason, "Cancelled by user");
    assert.ok(test.completedAt);
    // A finished test never changes afterwards.
    patchIncident(h.store, investigated);
    assert.equal(
      (await h.service.getTest(started.testId)).overallStatus,
      "cancelled",
    );
  });

  test("expected results are only used for grading, and a mismatch is reported", async () => {
    const h = harness();
    const started = await h.service.startTest("ORDERS_REDIS_FAILURE");
    assert.equal(started.evaluation.actualActionType, null, "nothing graded yet");
    assert.equal(started.evaluation.actionTypeMatched, null);

    patchIncident(h.store, {
      ...investigated,
      incidentType: "database_failure",
      recommendedAction: {
        type: "recover_database",
        target: "Database",
        risk: "medium",
        reason: "r",
      },
    });
    const test = await h.service.getTest(started.testId);

    assert.equal(test.evaluation.expectedActionType, "restart_redis");
    assert.equal(test.evaluation.actualActionType, "recover_database");
    assert.equal(test.evaluation.actionTypeMatched, false);
    assert.equal(test.evaluation.incidentTypeMatched, false);
  });
});

describe("deriveTestFromIncident (pure)", () => {
  const base: ResilienceTest = {
    testId: "RT-001",
    scenario: "ORDERS_REDIS_FAILURE",
    scenarioName: "Orders Redis failure",
    startedAt: iso(T0),
    completedAt: null,
    incidentId: "INC-T1",
    detectionStatus: "passed",
    investigationStatus: "in_progress",
    recommendationStatus: "pending",
    approvalStatus: "pending",
    remediationStatus: "pending",
    verificationStatus: "pending",
    overallStatus: "running",
    recoveryDurationMs: null,
    failureReason: null,
    triggeredAt: iso(T0),
    detectedAt: iso(T0 + 500),
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
      expectedIncidentType: "cache_failure",
      expectedActionType: "restart_redis",
      actualIncidentType: null,
      actualActionType: null,
      incidentTypeMatched: null,
      actionTypeMatched: null,
    },
    approvalTimeoutMs: 600_000,
  };

  test("does not mutate its input", () => {
    const before = JSON.stringify(base);

    deriveTestFromIncident(base, makeIncident(), T0 + 60_000);

    assert.equal(JSON.stringify(base), before);
  });

  test("a resolved incident yields PASSED with the real duration", () => {
    const test = deriveTestFromIncident(base, makeIncident(), T0 + 60_000);

    assert.equal(test.overallStatus, "passed");
    assert.equal(
      test.recoveryDurationMs,
      Date.parse("2026-09-30T10:00:42.000Z") - T0,
    );
  });

  test("finished tests are left untouched", () => {
    const finished = { ...base, overallStatus: "passed" as const };

    assert.equal(deriveTestFromIncident(finished, makeIncident(), T0), finished);
  });
});
