/**
 * Incident history service ("learning").
 *
 * - Records how incidents ended (verified recoveries vs failed attempts)
 * - Supplies relevant previous incidents as context for the ONE DeepSeek call
 *
 * Nothing here trains a model. History is only extra prompt context.
 * Storage failures never break an investigation or a resolution.
 */

import {
  getIncidentHistoryRepository,
  type IncidentHistoryRepository,
} from "@/lib/repositories";
import { logEvent } from "@/lib/logging";
import type {
  HistoryListQuery,
  IncidentHistoryRecord,
  NewIncidentHistoryRecord,
} from "@/lib/types/history";
import type { Incident, IncidentType } from "@/lib/types/incident";

const MAX_EVIDENCE_BULLETS = 5;
const MAX_TEXT = 240;

function clip(text: string, max = MAX_TEXT): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Maps an incident to a storable history record.
 * Only summary facts are kept: no raw logs, metrics, or evidence payloads.
 */
export function buildHistoryRecord(
  incident: Incident,
  outcome: "resolved" | "failed",
): NewIncidentHistoryRecord | null {
  const { rootCause, recommendedAction, recovery } = incident;
  if (!rootCause || !recommendedAction || !recovery) return null;

  const resolvedAt = recovery.verifiedAt ?? new Date().toISOString();
  const createdMs = Date.parse(incident.createdAt);
  const resolvedMs = Date.parse(resolvedAt);
  const recoveryDurationMs =
    Number.isFinite(createdMs) &&
    Number.isFinite(resolvedMs) &&
    resolvedMs >= createdMs
      ? resolvedMs - createdMs
      : null;

  const verificationResult =
    recovery.verified === true
      ? `${incident.service} recovered; health verification passed`
      : recovery.executed === false
        ? "Not verified: remediation did not complete"
        : "Health verification failed: service still unhealthy";

  return {
    incidentId: incident.id,
    incidentType: incident.incidentType ?? "unknown",
    service: incident.service,
    rootCause: clip(rootCause.summary, 400),
    confidence: rootCause.confidence,
    evidenceSummary: (rootCause.evidence ?? [])
      .slice(0, MAX_EVIDENCE_BULLETS)
      .map((item) => clip(item)),
    recommendedAction: clip(
      `${recommendedAction.type} ${recommendedAction.target} — ${recommendedAction.reason}`,
      400,
    ),
    actionType: recommendedAction.type,
    actionTarget: recommendedAction.target,
    actionResult: clip(recovery.result ?? "No result recorded"),
    verificationResult,
    outcome,
    resolvedAt,
    recoveryDurationMs,
  };
}

export interface IncidentHistoryService {
  /**
   * Store the final outcome of an incident:
   * - verified recovery  -> saved as resolved (learning material)
   * - remediation/verification failure -> saved as a failed attempt only
   * Never throws; returns null when nothing was stored.
   */
  recordOutcome(incident: Incident): Promise<IncidentHistoryRecord | null>;

  /** Previous resolved incidents relevant to this incident. Never throws. */
  getRelevantForIncident(
    incident: Pick<Incident, "service">,
    options?: { incidentType?: IncidentType; limit?: number },
  ): Promise<IncidentHistoryRecord[]>;

  listResolved(query?: HistoryListQuery): Promise<IncidentHistoryRecord[]>;
  listFailedAttempts(limit?: number): Promise<IncidentHistoryRecord[]>;
  getById(id: string): Promise<IncidentHistoryRecord | null>;
}

export function createIncidentHistoryService(
  getRepository: () => IncidentHistoryRepository = getIncidentHistoryRepository,
): IncidentHistoryService {
  return {
    async recordOutcome(incident) {
      try {
        const verifiedRecovery =
          incident.status === "resolved" &&
          incident.recovery?.executed === true &&
          incident.recovery.verified === true;

        const failedAttempt =
          !verifiedRecovery &&
          (incident.recovery?.executed === false ||
            incident.recovery?.verified === false);

        if (verifiedRecovery) {
          const input = buildHistoryRecord(incident, "resolved");
          if (!input) return null;
          const saved = await getRepository().saveResolvedIncident(input);
          logEvent("HISTORY_RESOLVED_SAVED", {
            incidentId: incident.id,
            historyId: saved.id,
          });
          return saved;
        }

        if (failedAttempt) {
          const input = buildHistoryRecord(incident, "failed");
          if (!input) return null;
          const saved = await getRepository().saveFailedAttempt(input);
          logEvent("HISTORY_FAILED_ATTEMPT_SAVED", {
            incidentId: incident.id,
            historyId: saved.id,
          });
          return saved;
        }

        return null;
      } catch (error) {
        logEvent("HISTORY_SAVE_FAILED", {
          incidentId: incident.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        return null;
      }
    },

    async getRelevantForIncident(incident, options) {
      try {
        return await getRepository().getRelevantPreviousIncidents({
          service: incident.service,
          incidentType: options?.incidentType,
          limit: options?.limit,
        });
      } catch (error) {
        logEvent("HISTORY_LOOKUP_FAILED", {
          error: error instanceof Error ? error.message : "unknown",
        });
        return [];
      }
    },

    listResolved(query) {
      return getRepository().getResolvedIncidents(query);
    },

    listFailedAttempts(limit) {
      return getRepository().getFailedAttempts(limit);
    },

    getById(id) {
      return getRepository().getIncidentById(id);
    },
  };
}

/** Default service bound to the configured repository. */
export const incidentHistoryService = createIncidentHistoryService();
