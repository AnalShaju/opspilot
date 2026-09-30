import type { Incident, IncidentReport } from "@/lib/types/incident";

/**
 * Builds a structured report from stored incident fields.
 */
export function generateIncidentReport(incident: Incident): IncidentReport {
  const evidenceSummary =
    incident.rootCause?.evidence ??
    incident.rootCause?.reasoning ??
    [];

  const started = incident.createdAt
    ? new Date(incident.createdAt).getTime()
    : undefined;
  const ended = incident.recovery?.verifiedAt
    ? new Date(incident.recovery.verifiedAt).getTime()
    : incident.recovery?.executedAt
      ? new Date(incident.recovery.executedAt).getTime()
      : Date.now();
  const recoveryTime =
    started && ended && ended >= started
      ? `${Math.max(1, Math.round((ended - started) / 1000))}s`
      : undefined;

  return {
    incident: incident.code,
    code: incident.code,
    title: incident.title,
    service: incident.service,
    severity: incident.severity,
    rootCause: incident.rootCause?.summary ?? "Not diagnosed yet",
    confidence: incident.rootCause?.confidence,
    evidenceSummary,
    action: incident.recommendedAction
      ? `${incident.recommendedAction.type} ${incident.recommendedAction.target}`
      : "No action taken",
    verification: incident.recovery?.verified
      ? `${incident.service} recovered`
      : incident.recovery?.verified === false
        ? "Recovery not verified"
        : "Not verified yet",
    status: incident.status,
    recoveryTime,
    generatedAt: new Date().toISOString(),
  };
}
