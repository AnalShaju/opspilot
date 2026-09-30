/**
 * Incident history ("learning") types.
 *
 * "Learning" here means: remember how past incidents were resolved and hand
 * the most relevant ones to DeepSeek as extra context. No training involved.
 *
 * Database-ready: flat scalar fields, ISO-8601 timestamps, string unions.
 * A Supabase table maps these camelCase fields to snake_case columns
 * (evidenceSummary -> jsonb / text[]).
 */

import type { ActionType, IncidentType } from "@/lib/types/incident";

/** Only verified recoveries count as "resolved" learning material. */
export type HistoryOutcome = "resolved" | "failed";

export interface IncidentHistoryRecord {
  /** History record id (e.g. HIST-001). Unique per stored outcome. */
  id: string;
  /** Source incident id. May repeat if the same incident is re-run. */
  incidentId: string;
  incidentType: IncidentType;
  service: string;
  rootCause: string;
  /** 0..1 */
  confidence: number;
  /** Short factual bullets. No raw logs / payloads are stored. */
  evidenceSummary: string[];
  /** Human-readable recommendation, e.g. "rollback v1.8.4 — <reason>". */
  recommendedAction: string;
  actionType: ActionType;
  actionTarget: string;
  actionResult: string;
  verificationResult: string;
  outcome: HistoryOutcome;
  /** Verification (success) or failure time, ISO-8601. */
  resolvedAt: string;
  /** createdAt -> resolvedAt in milliseconds, when known. */
  recoveryDurationMs: number | null;
  createdAt: string;
}

/** Everything except repository-assigned fields. */
export type NewIncidentHistoryRecord = Omit<
  IncidentHistoryRecord,
  "id" | "createdAt"
>;

export interface HistoryListQuery {
  service?: string;
  incidentType?: IncidentType;
  actionType?: ActionType;
  limit?: number;
}

export interface RelevantIncidentQuery {
  service: string;
  incidentType?: IncidentType;
  /** Optional: prefer previous incidents fixed with a similar action. */
  actionType?: ActionType;
  /** Defaults to 3, capped at 5. */
  limit?: number;
}
