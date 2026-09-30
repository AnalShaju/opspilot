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
  onProgress: (steps) => {
    // Progress polling is nice-to-have; skip DB chatter during the hot path
    // on Vercel so DeepSeek isn't blocked behind many Supabase round-trips.
    if (process.env.VERCEL === "1") return;
    enqueueProgress(incident.id, steps);
  },
});

/**
 * Appends missing closing braces/brackets (at most 2) when the text is
 * otherwise well-formed, e.g. the model forgot the last "}". Returns null when
 * the text is unbalanced in any other way (open string, mismatched closer, ...).
 */
function closeTrailingBrackets(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
    }
  }
  if (inString || stack.length === 0 || stack.length > 2) return null;
  return text + stack.reverse().join("");
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        const repaired = closeTrailingBrackets(candidate);
        if (repaired) {
          try {
            return JSON.parse(repaired);
          } catch {
            // fall through
          }
        }
      }
    }
    throw new AgentError("AI returned non-JSON final response", "INVALID_JSON");
  }
}

/**
 * Models occasionally close a brace too late and nest `recommendedAction`
 * inside `rootCause`. That single, unambiguous slip is repaired; anything else
 * is still rejected, and the lifted action goes through full validation.
 */
function liftMisplacedAction(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (data.recommendedAction) return data;
  const rootCause = data.rootCause;
  if (
    rootCause &&
    typeof rootCause === "object" &&
    "recommendedAction" in rootCause
  ) {
    const { recommendedAction, ...cleanRootCause } = rootCause as Record<
      string,
      unknown
    >;
    return { ...data, rootCause: cleanRootCause, recommendedAction };
  }
  return data;
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

  const data = liftMisplacedAction(raw as Record<string, unknown>);
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

async function writeSteps(incidentId: string, steps: InvestigationStep[]) {
  const existing = await getIncident(incidentId);
  if (!existing) return;
  // Skip if a newer investigation already finished (avoid clobbering).
  if (
    existing.status === "awaiting_approval" ||
    existing.status === "resolved" ||
    existing.status === "investigation_failed"
  ) {
    return;
  }
  await updateIncident(incidentId, {
    status: "investigating",
    investigation: {
      ...(existing.investigation ?? {
        startedAt: new Date().toISOString(),
      }),
      steps: [...steps],
    },
  });
}

/** Serialize + coalesce progress writes (latest steps win; avoids DB spam). */
const progressQueues = new Map<string, Promise<void>>();
const pendingSteps = new Map<string, InvestigationStep[]>();

function enqueueProgress(
  incidentId: string,
  steps: InvestigationStep[],
): void {
  // Keep only the newest snapshot; drop intermediate writes that haven't started.
  pendingSteps.set(incidentId, steps);
  const previous = progressQueues.get(incidentId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const latest = pendingSteps.get(incidentId);
    if (!latest) return;
    pendingSteps.delete(incidentId);
    await writeSteps(incidentId, latest);
  });
  progressQueues.set(
    incidentId,
    next.finally(() => {
      if (progressQueues.get(incidentId) === next) {
        progressQueues.delete(incidentId);
      }
    }),
  );
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
  let diagnosis: AgentDiagnosis;
  try {
    diagnosis = validateAgentDiagnosis(extractJsonObject(content), {
      evidence,
      incidentService: incident.service,
      detectedIncidentType,
    });
  } catch (error) {
    // Diagnostic only: the response is truncated and contains no secrets.
    logEvent("AI_INVALID_RESPONSE", {
      incidentId: incident.id,
      reason: error instanceof Error ? error.message : "unknown",
      length: content.length,
      snippet: content.slice(0, 1600),
    });
    throw error;
  }

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
