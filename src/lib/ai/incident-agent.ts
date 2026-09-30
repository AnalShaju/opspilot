/**
 * OpsPilot incident investigation.
 *
 *   1. Backend collects ALL current evidence from the simulator
 *   2. Backend looks up relevant previous resolved incidents (history)
 *   3. EXACTLY ONE DeepSeek call: evidence + history -> diagnosis JSON
 *   4. Backend validates the diagnosis (unsupported actions are rejected)
 *
 * DeepSeek never calls tools and never executes anything.
 * There is no retry / re-ask: invalid output fails the investigation clearly.
 */

import { callDeepSeek, type DeepSeekMessage } from "@/lib/ai/deepseek";
import { parseDeployments, validateAction, RISK_LEVELS } from "@/lib/ai/action-validation";
import {
  OPSPILOT_SYSTEM_PROMPT,
  buildInvestigationPrompt,
} from "@/lib/ai/prompts";
import {
  collectEvidence,
  type CollectedEvidence,
} from "@/lib/evidence/collector";
import { classifyIncidentType } from "@/lib/incidents/classify";
import { getIncident, updateIncident } from "@/lib/incidents/incidentStore";
import { logEvent } from "@/lib/logging";
import { incidentHistoryService } from "@/lib/services/incident-history.service";
import {
  AgentError,
  type AgentDiagnosis,
  type AgentInvestigationResult,
  type InvestigationStep,
} from "@/lib/types/agent";
import type { IncidentHistoryRecord } from "@/lib/types/history";
import {
  INCIDENT_TYPES,
  type Incident,
  type IncidentType,
} from "@/lib/types/incident";

/** Injection points so the workflow is testable without network access. */
export interface AgentDependencies {
  collectEvidence: typeof collectEvidence;
  getHistory: (
    incident: Incident,
    incidentType: IncidentType,
  ) => Promise<IncidentHistoryRecord[]>;
  /** The ONE model call. Receives the full prompt, returns raw content. */
  callModel: (messages: DeepSeekMessage[]) => Promise<string | null>;
  onProgress: (steps: InvestigationStep[]) => void;
}

const defaultDependencies = (incident: Incident): AgentDependencies => ({
  collectEvidence,
  getHistory: (target, incidentType) =>
    incidentHistoryService.getRelevantForIncident(target, {
      incidentType,
      limit: 5,
    }),
  callModel: async (messages) =>
    (await callDeepSeek({ messages, jsonMode: true })).content,
  onProgress: (steps) => writeSteps(incident.id, steps),
});

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AgentError("AI returned non-JSON final response", "INVALID_JSON");
  }
}

export function validateAgentDiagnosis(
  raw: unknown,
  context: {
    evidence: Pick<CollectedEvidence, "deployments">;
    incidentService?: string;
    detectedIncidentType?: IncidentType;
  },
): AgentDiagnosis {
  if (!raw || typeof raw !== "object") {
    throw new AgentError("AI diagnosis is not an object", "INVALID_DIAGNOSIS");
  }

  const data = raw as Record<string, unknown>;
  const rootCause = data.rootCause as Record<string, unknown> | undefined;
  const recommendedAction = data.recommendedAction as
    | Record<string, unknown>
    | undefined;

  if (!rootCause || typeof rootCause !== "object") {
    throw new AgentError("Missing rootCause", "INVALID_DIAGNOSIS");
  }
  if (!recommendedAction || typeof recommendedAction !== "object") {
    throw new AgentError("Missing recommendedAction", "INVALID_DIAGNOSIS");
  }

  const summary = rootCause.summary;
  const confidence = rootCause.confidence;
  const evidence = rootCause.evidence;

  if (typeof summary !== "string" || !summary.trim()) {
    throw new AgentError("Invalid rootCause.summary", "INVALID_DIAGNOSIS");
  }
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    throw new AgentError(
      "rootCause.confidence must be a number between 0 and 1",
      "INVALID_DIAGNOSIS",
    );
  }
  if (
    !Array.isArray(evidence) ||
    evidence.length === 0 ||
    !evidence.every((item) => typeof item === "string")
  ) {
    throw new AgentError(
      "rootCause.evidence must be a non-empty string array",
      "INVALID_DIAGNOSIS",
    );
  }

  const risk = recommendedAction.risk;
  const reason = recommendedAction.reason;
  if (!RISK_LEVELS.includes(risk as never)) {
    throw new AgentError("Invalid recommendedAction.risk", "INVALID_ACTION");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new AgentError("Invalid recommendedAction.reason", "INVALID_ACTION");
  }

  // Rejects unsupported actions and unknown rollback targets.
  const action = validateAction(recommendedAction, {
    deployments: parseDeployments(context.evidence.deployments),
    incidentService: context.incidentService,
  });

  const aiType = data.incidentType;
  const incidentType: IncidentType =
    typeof aiType === "string" &&
    (INCIDENT_TYPES as readonly string[]).includes(aiType) &&
    aiType !== "unknown"
      ? (aiType as IncidentType)
      : (context.detectedIncidentType ?? "unknown");

  const investigationSummary =
    typeof data.investigationSummary === "string" &&
    data.investigationSummary.trim()
      ? data.investigationSummary.trim()
      : summary.trim();

  return {
    rootCause: {
      summary: summary.trim(),
      confidence,
      evidence: evidence.map((item) => String(item).trim()),
    },
    incidentType,
    investigationSummary,
    recommendedAction: {
      type: action.type,
      target: action.target,
      service: action.service,
      risk: risk as AgentDiagnosis["recommendedAction"]["risk"],
      reason: reason.trim(),
    },
  };
}

function writeSteps(incidentId: string, steps: InvestigationStep[]) {
  const existing = getIncident(incidentId);
  if (!existing) return;
  updateIncident(incidentId, {
    status: "investigating",
    investigation: {
      ...(existing.investigation ?? {
        startedAt: new Date().toISOString(),
      }),
      steps: [...steps],
    },
  });
}

export async function runIncidentAgent(
  incident: Incident,
  overrides: Partial<AgentDependencies> = {},
): Promise<AgentInvestigationResult> {
  const deps = { ...defaultDependencies(incident), ...overrides };

  logEvent("INVESTIGATION_STARTED", { incidentId: incident.id });

  // 1. Collect ALL current evidence first.
  const { evidence, steps } = await deps.collectEvidence({
    onProgress: deps.onProgress,
  });

  const detectedIncidentType = classifyIncidentType(evidence);

  // 2. Relevant previous resolved incidents (deterministic matching).
  const historyStep: InvestigationStep = {
    tool: "getIncidentHistory",
    status: "running",
    startedAt: new Date().toISOString(),
  };
  steps.push(historyStep);
  deps.onProgress(steps.map((s) => ({ ...s })));

  const historyUsed = await deps.getHistory(incident, detectedIncidentType);

  historyStep.status = "completed";
  historyStep.completedAt = new Date().toISOString();
  historyStep.summary = `${historyUsed.length} relevant previous incident${historyUsed.length === 1 ? "" : "s"}`;
  deps.onProgress(steps.map((s) => ({ ...s })));

  // 3. The ONE DeepSeek call.
  const messages: DeepSeekMessage[] = [
    { role: "system", content: OPSPILOT_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildInvestigationPrompt({
        incident,
        detectedIncidentType,
        evidence,
        history: historyUsed,
      }),
    },
  ];

  logEvent("AI_CALL_STARTED", {
    incidentId: incident.id,
    historyCount: historyUsed.length,
  });
  const content = await deps.callModel(messages);

  if (!content || !content.trim()) {
    throw new AgentError("AI finished without a diagnosis", "EMPTY_DIAGNOSIS");
  }

  // 4. Validate before anything can act on it.
  const diagnosis = validateAgentDiagnosis(extractJsonObject(content), {
    evidence,
    incidentService: incident.service,
    detectedIncidentType,
  });

  logEvent("AI_ANALYSIS_COMPLETED", {
    incidentId: incident.id,
    confidence: diagnosis.rootCause.confidence,
    action: diagnosis.recommendedAction.type,
    target: diagnosis.recommendedAction.target,
  });

  return {
    diagnosis,
    steps,
    evidenceBag: {
      getLogs: evidence.logs,
      getServices: evidence.services,
      getDeployments: evidence.deployments,
      getMetrics: evidence.metrics,
      getHealth: evidence.health,
      getPreviousIncidents: evidence.simulatorIncidents,
      getIncidentHistory: historyUsed,
    },
    rawFinalContent: content,
    detectedIncidentType,
    historyUsed,
    aiCallCount: 1,
  };
}
