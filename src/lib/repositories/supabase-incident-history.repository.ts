/**
 * Supabase incident_history — matches the LIVE table:
 * id uuid, incident_id, incident_type, service, root_cause, confidence,
 * evidence_summary text, action_*, verification_result,
 * recovery_duration_seconds, resolved_at, created_at
 *
 * Only verified recoveries are stored (no outcome column for failures).
 */

import {
  clampRelevantLimit,
  relevanceScore,
  type IncidentHistoryRepository,
} from "@/lib/repositories/incident-history.repository";
import { requireRow, throwStorageError } from "@/lib/supabase/errors";
import {
  msToSeconds,
  secondsToMs,
  summaryFromText,
  summaryToText,
} from "@/lib/supabase/status-map";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type {
  HistoryListQuery,
  IncidentHistoryRecord,
  NewIncidentHistoryRecord,
  RelevantIncidentQuery,
} from "@/lib/types/history";
import type { ActionType, IncidentType } from "@/lib/types/incident";

type HistoryRow = {
  id: string;
  incident_id: string | null;
  incident_type: string;
  service: string;
  root_cause: string;
  confidence: number | null;
  evidence_summary: string | null;
  action_type: string | null;
  action_target: string | null;
  action_result: string | null;
  verification_result: string | null;
  recovery_duration_seconds: number | null;
  resolved_at: string;
  created_at: string;
};

function fromRow(row: HistoryRow): IncidentHistoryRecord {
  return {
    id: row.id,
    incidentId: row.incident_id ?? "",
    incidentType: row.incident_type as IncidentType,
    service: row.service,
    rootCause: row.root_cause,
    confidence: row.confidence ?? 0,
    evidenceSummary: summaryFromText(row.evidence_summary),
    recommendedAction: `${row.action_type ?? ""} ${row.action_target ?? ""}`.trim(),
    actionType: (row.action_type as ActionType) ?? "rollback",
    actionTarget: row.action_target ?? "",
    actionResult: row.action_result ?? "",
    verificationResult: row.verification_result ?? "",
    outcome: "resolved",
    resolvedAt: row.resolved_at,
    recoveryDurationMs: secondsToMs(row.recovery_duration_seconds),
    createdAt: row.created_at,
  };
}

function toInsert(input: NewIncidentHistoryRecord) {
  return {
    incident_id: input.incidentId || null,
    incident_type: input.incidentType,
    service: input.service,
    root_cause: input.rootCause,
    confidence: input.confidence,
    evidence_summary: summaryToText(input.evidenceSummary),
    action_type: input.actionType,
    action_target: input.actionTarget,
    action_result: input.actionResult,
    verification_result: input.verificationResult,
    recovery_duration_seconds: msToSeconds(input.recoveryDurationMs),
    resolved_at: input.resolvedAt,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export class SupabaseIncidentHistoryRepository
  implements IncidentHistoryRepository
{
  private readonly client: OpsPilotSupabase;

  constructor(client: OpsPilotSupabase = getSupabaseAdmin()) {
    this.client = client;
  }

  async saveResolvedIncident(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord> {
    const { data, error } = await this.client
      .from("incident_history")
      .insert(toInsert({ ...input, outcome: "resolved" }))
      .select("*")
      .single();

    return fromRow(
      requireRow("saving incident history", data as HistoryRow | null, error),
    );
  }

  /**
   * The live schema has no outcome column for failures. Failed attempts are
   * not stored as historical knowledge (matches the product rule).
   */
  async saveFailedAttempt(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord> {
    return {
      ...input,
      outcome: "failed",
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      evidenceSummary: [...input.evidenceSummary],
    };
  }

  async getResolvedIncidents(
    query: HistoryListQuery = {},
  ): Promise<IncidentHistoryRecord[]> {
    let request = this.client
      .from("incident_history")
      .select("*")
      .order("resolved_at", { ascending: false });

    if (query.service) request = request.ilike("service", query.service);
    if (query.incidentType) {
      request = request.eq("incident_type", query.incidentType);
    }
    if (query.actionType) request = request.eq("action_type", query.actionType);
    if (typeof query.limit === "number") request = request.limit(query.limit);

    const { data, error } = await request;
    if (error) throwStorageError("listing incident history", error);
    return (data as HistoryRow[] | null)?.map(fromRow) ?? [];
  }

  async getFailedAttempts(limit?: number): Promise<IncidentHistoryRecord[]> {
    void limit;
    return [];
  }

  async getRelevantPreviousIncidents(
    query: RelevantIncidentQuery,
  ): Promise<IncidentHistoryRecord[]> {
    const limit = clampRelevantLimit(query.limit);
    const { data, error } = await this.client
      .from("incident_history")
      .select("*")
      .order("resolved_at", { ascending: false })
      .limit(50);

    if (error) throwStorageError("loading relevant incident history", error);

    const rows = (data as HistoryRow[] | null)?.map(fromRow) ?? [];
    return rows
      .map((record) => ({ record, score: relevanceScore(record, query) }))
      .filter(({ record, score }) => {
        if (score === 0) return false;
        const serviceMatch =
          record.service.toLowerCase() === query.service.toLowerCase();
        const typeMatch =
          !!query.incidentType &&
          query.incidentType !== "unknown" &&
          record.incidentType === query.incidentType;
        return serviceMatch || typeMatch;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.record.resolvedAt.localeCompare(a.record.resolvedAt),
      )
      .slice(0, limit)
      .map(({ record }) => record);
  }

  async getIncidentById(id: string): Promise<IncidentHistoryRecord | null> {
    // Non-UUID ids cannot exist in this schema — treat as missing.
    if (!isUuid(id)) return null;

    const byId = await this.client
      .from("incident_history")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (byId.error) throwStorageError(`loading history ${id}`, byId.error);
    if (byId.data) return fromRow(byId.data as HistoryRow);

    const byIncident = await this.client
      .from("incident_history")
      .select("*")
      .eq("incident_id", id)
      .order("resolved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byIncident.error) {
      throwStorageError(`loading history for incident ${id}`, byIncident.error);
    }
    return byIncident.data ? fromRow(byIncident.data as HistoryRow) : null;
  }
}
