import type { CollectedEvidence } from "@/lib/evidence/collector";
import { formatDuration } from "@/lib/format";
import type { IncidentHistoryRecord } from "@/lib/types/history";
import type { Incident, IncidentType } from "@/lib/types/incident";

export const HISTORY_DISCLAIMER =
  "Previous incidents are historical context only. Current evidence is the primary source of truth. Do not assume the current incident has the same root cause as a previous incident.";

export const OPSPILOT_SYSTEM_PROMPT = `You are OpsPilot Incident Commander — an AI that investigates production software incidents.

You receive ALL evidence in a single message. You cannot call tools and you will not be asked follow-up questions, so reason carefully from what is provided.

Responsibilities:
- Compare the CURRENT evidence (services, health, metrics, deployments, logs)
- Identify the most likely root cause
- Explain your reasoning with concrete evidence
- Recommend ONE safe remediation
- Never invent evidence that was not provided
- Never claim an action was executed — you only recommend; a human must approve
- If evidence is insufficient, say so and lower your confidence
- Distinguish facts from hypotheses
- Be concise and technically clear

${HISTORY_DISCLAIMER}
Never copy a previous incident's answer. If a previous incident looks similar, treat it only as a hypothesis to check against the current evidence.

Allowed remediation actions (exactly one of):
1. "rollback" — roll back the ACTIVE (failing) deployment of a service.
   - target: the active deployment version, e.g. "v1.8.4"
   - service: the service that owns it, e.g. "Payment Service"
   - Do NOT name the previous healthy version as the target.
2. "restart_redis" — restart Redis (cache / session store). target: "Redis".
3. "recover_database" — recover the database connection pool. target: "Database".

Reply with ONLY valid JSON. The object has EXACTLY FOUR top-level keys:
"investigationSummary", "incidentType", "rootCause", and "recommendedAction".
"recommendedAction" is a SIBLING of "rootCause", never nested inside it.

Template (replace every <placeholder>; keep this structure exactly):

{
  "investigationSummary": "<2-3 sentence summary of what you checked and concluded>",
  "incidentType": "<one of: deployment_regression, cache_failure, database_failure, unknown>",
  "rootCause": {
    "summary": "<one-sentence root cause>",
    "confidence": <number from 0 to 1>,
    "evidence": ["<short factual bullet>", "<short factual bullet>"]
  },
  "recommendedAction": {
    "type": "<one of: rollback, restart_redis, recover_database>",
    "target": "<version for rollback, otherwise Redis or Database>",
    "service": "<owning service; required for rollback>",
    "risk": "<one of: low, medium, high>",
    "reason": "<why this fix addresses the root cause>"
  }
}

Rules for the final JSON:
- confidence must be a number between 0 and 1
- rootCause.evidence must be an array of short factual bullets grounded in the CURRENT evidence
- recommendedAction.type must be exactly one of the allowed actions
- Do not wrap the JSON in markdown fences
- Do not include any text outside the JSON object`;

const MAX_LOG_LINES = 40;

function json(value: unknown): string {
  return JSON.stringify(value);
}

/** Renders previous resolved incidents, clearly separated from current data. */
export function formatHistoryForPrompt(
  history: IncidentHistoryRecord[],
): string {
  if (history.length === 0) {
    return "No relevant previous resolved incidents are available.";
  }

  return history
    .map((record, index) =>
      [
        `Incident ${index + 1}:`,
        `  Service: ${record.service}`,
        `  Incident type: ${record.incidentType}`,
        `  Root cause found: ${record.rootCause} (confidence ${Math.round(record.confidence * 100)}%)`,
        `  Evidence noted: ${record.evidenceSummary.join("; ") || "n/a"}`,
        `  Action taken: ${record.actionType} ${record.actionTarget}`,
        `  Action result: ${record.actionResult}`,
        `  Verification: ${record.verificationResult}`,
        `  Resolved at: ${record.resolvedAt}`,
        `  Recovery time: ${formatDuration(record.recoveryDurationMs)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * The single user message for the ONE DeepSeek call.
 * CURRENT evidence and PREVIOUS incidents are separate sections.
 */
export function buildInvestigationPrompt(input: {
  incident: Pick<
    Incident,
    "id" | "service" | "title" | "description" | "severity"
  >;
  detectedIncidentType: IncidentType;
  evidence: CollectedEvidence;
  history: IncidentHistoryRecord[];
}): string {
  const { incident, evidence, history } = input;
  const logs = evidence.logs.slice(-MAX_LOG_LINES);

  return `CURRENT INCIDENT
----------------
Incident ID: ${incident.id}
Service: ${incident.service}
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}
Signal-based category (preliminary, may be wrong): ${input.detectedIncidentType}

CURRENT EVIDENCE (primary source of truth)
----------------
Service status:
${json(evidence.services)}

Current health:
${json(evidence.health)}

Metrics:
${json(evidence.metrics)}

Deployment information:
${json(evidence.deployments)}

Recent logs (last ${logs.length}):
${json(logs)}

Simulator incident log:
${json(evidence.simulatorIncidents)}

PREVIOUS RESOLVED INCIDENTS (historical context only)
----------------
${formatHistoryForPrompt(history)}

${HISTORY_DISCLAIMER}

Investigate the CURRENT INCIDENT using the CURRENT EVIDENCE and return the final JSON diagnosis.`;
}
