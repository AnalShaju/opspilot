/**
 * Incident business logic.
 * Routes stay thin; this module owns the workflow steps:
 *
 *   detected -> investigate (evidence + history + ONE DeepSeek call)
 *            -> awaiting_approval -> human approves
 *            -> deterministic remediation -> health verification
 *            -> resolved (saved to incident history) | failed
 *
 * Persistence is behind IncidentRepository (in-memory or Supabase).
 */

import {
  parseDeployments,
  validateAction,
} from "@/lib/ai/action-validation";
import { runIncidentAgent } from "@/lib/ai/incident-agent";
import {
  createIncidentId,
  getIncident,
  listIncidents,
  saveIncident,
  updateIncident,
} from "@/lib/incidents/incidentStore";
import { logEvent } from "@/lib/logging";
import { getResilienceTestRepository } from "@/lib/repositories";
import { generateIncidentReport } from "@/lib/reports/reportService";
import { incidentHistoryService } from "@/lib/services/incident-history.service";
import {
  evaluateHealth,
  executeRemediation,
  getDeployments,
  isAllowedAction,
  prepareDemoScenario,
  DEMO_SCENARIO_ID,
  verifyHealth,
} from "@/lib/tools";
import type { InvestigationStep } from "@/lib/types/agent";
import type {
  CreateIncidentInput,
  Incident,
  Recovery,
} from "@/lib/types/incident";
import type { SimulatorHealth } from "@/lib/types/simulator";

export async function createIncident(
  input: CreateIncidentInput,
): Promise<Incident> {
  const now = new Date().toISOString();
  const id = await createIncidentId();

  const incident: Incident = {
    id,
    code: id,
    service: input.service,
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: "detected",
    errorRate: input.errorRate,
    incidentType: input.incidentType,
    source: input.source ?? "manual",
    scenarioId: input.scenarioId,
    resilienceTestId: input.resilienceTestId,
    createdAt: now,
    updatedAt: now,
  };

  logEvent("INCIDENT_CREATED", { incidentId: id, service: input.service });
  return saveIncident(incident);
}

export async function ensureDemoIncident(): Promise<Incident> {
  // Resilience-test incidents are never reused as the demo incident.
  const existing = (await listIncidents()).find((item) => item.source === "demo");

  if (existing) {
    // Re-arm terminal demo states so homepage → investigate works repeatedly.
    if (
      existing.status === "resolved" ||
      existing.status === "failed" ||
      existing.status === "investigation_failed"
    ) {
      const reset = await updateIncident(existing.id, {
        status: "detected",
        incidentType: undefined,
        rootCause: undefined,
        recommendedAction: undefined,
        approval: undefined,
        recovery: undefined,
        investigation: undefined,
        report: undefined,
        errorRate: 82,
        description: "500 errors detected across payment requests",
      });
      if (reset) return reset;
    }
    return existing;
  }

  return createIncident({
    service: "Payment Service",
    title: "Payment Service 500 Errors",
    description: "500 errors detected across payment requests",
    severity: "critical",
    errorRate: 82,
    source: "demo",
    scenarioId: DEMO_SCENARIO_ID,
  });
}

export async function getAllIncidents(): Promise<Incident[]> {
  return listIncidents();
}

export async function getIncidentById(
  id: string,
): Promise<Incident | undefined> {
  return getIncident(id);
}

type InvestigationOutcome = {
  incident: Incident;
  investigation: Incident["investigation"];
};

const INFLIGHT_KEY = "__opspilot_inflight_investigations__";

/** One shared promise per incident: concurrent callers never double-call the AI. */
function inflightInvestigations(): Map<string, Promise<InvestigationOutcome>> {
  const globalRef = globalThis as typeof globalThis & {
    [INFLIGHT_KEY]?: Map<string, Promise<InvestigationOutcome>>;
  };
  if (!globalRef[INFLIGHT_KEY]) globalRef[INFLIGHT_KEY] = new Map();
  return globalRef[INFLIGHT_KEY];
}

/**
 * Full investigation: evidence -> history -> ONE DeepSeek call -> validated
 * diagnosis. Safe to call repeatedly / concurrently for the same incident.
 */
export async function investigateIncidentWithAi(
  incidentId: string,
): Promise<InvestigationOutcome> {
  const existing = await getIncident(incidentId);
  if (!existing) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  // Already investigated: return the stored diagnosis (no new AI call).
  if (
    existing.status === "awaiting_approval" ||
    existing.status === "remediating" ||
    existing.status === "verifying" ||
    existing.status === "resolved"
  ) {
    return { incident: existing, investigation: existing.investigation };
  }

  const inflight = inflightInvestigations();
  const running = inflight.get(incidentId);
  if (running) return running;

  const promise = runInvestigation(incidentId).finally(() => {
    inflight.delete(incidentId);
  });
  inflight.set(incidentId, promise);
  return promise;
}

async function runInvestigation(
  incidentId: string,
): Promise<InvestigationOutcome> {
  const existing = await getIncident(incidentId);
  if (!existing) throw new Error(`Incident not found: ${incidentId}`);

  // Retrying after a failure starts from a clean slate.
  if (
    existing.status === "failed" ||
    existing.status === "investigation_failed"
  ) {
    await updateIncident(incidentId, {
      status: "investigating",
      recovery: undefined,
      approval: undefined,
      recommendedAction: undefined,
      rootCause: undefined,
      investigation: undefined,
    });
  } else {
    await updateIncident(incidentId, { status: "investigating" });
  }

  const startedAt =
    (await getIncident(incidentId))?.investigation?.startedAt ??
    new Date().toISOString();
  await updateIncident(incidentId, {
    investigation: { startedAt, steps: [] },
  });

  try {
    // Demo incident only: make sure the simulator is in the demo failure
    // (never disturbs a scenario owned by a running Resilience Test).
    if (existing.source === "demo") {
      const resilienceRunning =
        (await getResilienceTestRepository().findRunningTest()) !== null;
      await prepareDemoScenario({ preserveActive: resilienceRunning });
    }

    const result = await runIncidentAgent(
      (await getIncident(incidentId)) ?? existing,
    );
    const { diagnosis } = result;

    const incident = await updateIncident(incidentId, {
      status: "awaiting_approval",
      incidentType: diagnosis.incidentType,
      rootCause: {
        summary: diagnosis.rootCause.summary,
        confidence: diagnosis.rootCause.confidence,
        evidence: diagnosis.rootCause.evidence,
      },
      recommendedAction: diagnosis.recommendedAction,
      investigation: {
        startedAt,
        completedAt: new Date().toISOString(),
        steps: result.steps,
        evidence: {
          bag: result.evidenceBag,
          logs: result.evidenceBag.getLogs,
          metrics: result.evidenceBag.getMetrics,
          services: result.evidenceBag.getServices,
          deployments: result.evidenceBag.getDeployments,
          previousIncidents: result.evidenceBag.getPreviousIncidents,
          collectedAt: new Date().toISOString(),
        },
        summary: diagnosis.investigationSummary,
        historyRecordIds: result.historyUsed.map((record) => record.id),
        aiCallCount: result.aiCallCount,
        notes: [
          `DeepSeek investigation completed (${result.aiCallCount} AI call)`,
          `${result.historyUsed.length} previous incident(s) used as context`,
        ],
      },
    });

    if (!incident) {
      throw new Error(`Failed to update incident: ${incidentId}`);
    }

    logEvent("RECOMMENDATION_CREATED", {
      incidentId,
      action: incident.recommendedAction?.type,
      target: incident.recommendedAction?.target,
    });

    return { incident, investigation: incident.investigation };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Investigation failed";
    const current = await getIncident(incidentId);

    await updateIncident(incidentId, {
      status: "investigation_failed",
      investigation: {
        startedAt,
        completedAt: new Date().toISOString(),
        steps: current?.investigation?.steps ?? ([] as InvestigationStep[]),
        error: message,
      },
    });

    throw error;
  }
}

async function verificationFailed(
  incidentId: string,
  recovery: Recovery,
  reason: string,
  raw?: unknown,
): Promise<Incident | undefined> {
  return updateIncident(incidentId, {
    status: "failed",
    recovery: {
      ...recovery,
      verified: false,
      verifiedAt: new Date().toISOString(),
      result: `${recovery.result}. ${reason}`,
      verificationRaw: raw,
    },
  });
}

export async function approveAndRemediate(
  incidentId: string,
  approved: boolean,
): Promise<Incident> {
  const existing = await getIncident(incidentId);
  if (!existing) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  // Idempotent: a second approve on a resolved incident changes nothing.
  if (existing.status === "resolved") return existing;

  if (existing.status === "remediating" || existing.status === "verifying") {
    throw new Error(
      "Remediation is already in progress; it is not allowed to start twice",
    );
  }

  logEvent("APPROVAL_RECEIVED", { incidentId, approved });

  if (!approved) {
    const declined = await updateIncident(incidentId, {
      approval: {
        approved: false,
        approvedAt: new Date().toISOString(),
      },
      status: "failed",
    });
    if (!declined) throw new Error(`Failed to update incident: ${incidentId}`);
    return declined;
  }

  const recommended = existing.recommendedAction;
  if (!recommended) {
    throw new Error(
      "No recommended action on this incident. Investigate before approval.",
    );
  }

  if (!isAllowedAction(recommended.type)) {
    throw new Error(`Action type not allowed: ${recommended.type}`);
  }

  // Backend validation against FRESH deployment data. For rollback this maps
  // to the currently active deployment of the right service.
  let deployments: ReturnType<typeof parseDeployments> = [];
  try {
    deployments = parseDeployments(await getDeployments());
  } catch {
    // Fall back to the stored recommendation if deployments can't be refreshed.
  }

  const action =
    recommended.type === "rollback" && deployments.length === 0
      ? { ...recommended }
      : validateAction(recommended, {
          deployments,
          incidentService: existing.service,
        });

  if (
    action.target !== recommended.target ||
    action.service !== recommended.service
  ) {
    await updateIncident(incidentId, {
      recommendedAction: { ...recommended, ...action },
    });
  }

  await updateIncident(incidentId, {
    approval: {
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: "human",
    },
    status: "remediating",
  });
  logEvent("REMEDIATION_STARTED", {
    incidentId,
    action: action.type,
    target: action.target,
  });

  let actionResult;
  try {
    actionResult = await executeRemediation(action);
  } catch (error) {
    const failed = await updateIncident(incidentId, {
      status: "failed",
      recovery: {
        action: action.type,
        target: action.target,
        executed: false,
        executedAt: new Date().toISOString(),
        result: error instanceof Error ? error.message : "Remediation failed",
      },
    });
    // Failed attempt is stored separately; never as a learned resolution.
    if (failed) await incidentHistoryService.recordOutcome(failed);
    throw error;
  }

  logEvent("REMEDIATION_COMPLETED", {
    incidentId,
    action: action.type,
    target: action.target,
  });

  const executedRecovery: Recovery = {
    action: action.type,
    target: action.target,
    executed: true,
    executedAt: new Date().toISOString(),
    result:
      actionResult.message ??
      `${action.type} ${action.target} executed successfully`,
  };

  await updateIncident(incidentId, {
    status: "verifying",
    recovery: executedRecovery,
  });

  let health: SimulatorHealth;
  try {
    health = await verifyHealth();
  } catch (error) {
    const failed = await verificationFailed(
      incidentId,
      executedRecovery,
      "Health verification could not be completed.",
      { error: error instanceof Error ? error.message : "unknown" },
    );
    if (failed) await incidentHistoryService.recordOutcome(failed);
    throw error;
  }

  const recovered = evaluateHealth(health);

  logEvent("VERIFICATION_COMPLETED", {
    incidentId,
    recovered,
    errorRate: health.errorRate,
  });

  const resolved = await updateIncident(incidentId, {
    status: recovered ? "resolved" : "failed",
    recovery: {
      ...executedRecovery,
      verified: recovered,
      verifiedAt: new Date().toISOString(),
      paymentService:
        typeof health.paymentService === "string"
          ? health.paymentService
          : undefined,
      errorRate:
        typeof health.errorRate === "number" ? health.errorRate : undefined,
      paymentSuccessRate:
        typeof health.paymentSuccessRate === "number"
          ? health.paymentSuccessRate
          : undefined,
      verificationRaw: health,
    },
  });

  if (!resolved) {
    throw new Error(`Failed to finalize incident: ${incidentId}`);
  }

  if (recovered) {
    logEvent("INCIDENT_RESOLVED", { incidentId });
    const report = generateIncidentReport(resolved);
    const final = (await updateIncident(incidentId, { report })) ?? resolved;
    // Learn from it: only verified recoveries are stored as resolved.
    await incidentHistoryService.recordOutcome(final);
    return final;
  }

  // Remediation ran but service is still unhealthy: not a learned resolution.
  await incidentHistoryService.recordOutcome(resolved);
  return resolved;
}

export async function getIncidentReport(incidentId: string) {
  const incident = await getIncident(incidentId);
  if (!incident) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  if (incident.report) {
    return incident.report;
  }

  return generateIncidentReport(incident);
}
