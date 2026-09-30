/**
 * Supabase implementation of IncidentHistoryRepository.
 * Resolved and failed attempts share incident_history, distinguished by outcome.
 */

import {
  clampRelevantLimit,
  relevanceScore,
  type IncidentHistoryRepository,
} from "@/lib/repositories/incident-history.repository";
import { requireRow, throwStorageError } from "@/lib/supabase/errors";
import { nextPrefixedId } from "@/lib/supabase/helpers";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type {
  HistoryListQuery,
  HistoryOutcome,
  IncidentHistoryRecord,
  NewIncidentHistoryRecord,
  RelevantIncidentQuery,
} from "@/lib/types/history";
import type { ActionType, IncidentType } from "@/lib/types/incident";

type HistoryRow = {
  id: string;
  incident_id: string;
  incident_type: string;
  service: string;
  root_cause: string;
  confidence: number;
  evidence_summary: string[] | null;
  recommended_action: string;
  action_type: string;
  action_target: string;
  action_result: string;
  verification_result: string;
  outcome: string;
  resolved_at: string;
  recovery_duration_ms: number | null;
  created_at: string;
};

function toRow(
  input: NewIncidentHistoryRecord,
  id: string,
  createdAt: string,
): HistoryRow {
  return {
    id,
    incident_id: input.incidentId,
    incident_type: input.incidentType,
    service: input.service,
    root_cause: input.rootCause,
    confidence: input.confidence,
    evidence_summary: [...input.evidenceSummary],
    recommended_action: input.recommendedAction,
    action_type: input.actionType,
    action_target: input.actionTarget,
    action_result: input.actionResult,
    verification_result: input.verificationResult,
    outcome: input.outcome,
    resolved_at: input.resolvedAt,
    recovery_duration_ms: input.recoveryDurationMs,
    created_at: createdAt,
  };
}

function fromRow(row: HistoryRow): IncidentHistoryRecord {
  return {
    id: row.id,
    incidentId: row.incident_id,
    incidentType: row.incident_type as IncidentType,
    service: row.service,
    rootCause: row.root_cause,
    confidence: row.confidence,
    evidenceSummary: Array.isArray(row.evidence_summary)
      ? row.evidence_summary.map(String)
      : [],
    recommendedAction: row.recommended_action,
    actionType: row.action_type as ActionType,
    actionTarget: row.action_target,
    actionResult: row.action_result,
    verificationResult: row.verification_result,
    outcome: row.outcome as HistoryOutcome,
    resolvedAt: row.resolved_at,
    recoveryDurationMs: row.recovery_duration_ms,
    createdAt: row.created_at,
  };
}

export class SupabaseIncidentHistoryRepository
  implements IncidentHistoryRepository
{
  private readonly client: OpsPilotSupabase;

  constructor(client: OpsPilotSupabase = getSupabaseAdmin()) {
    this.client = client;
  }

  private async insert(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord> {
    const id = await nextPrefixedId(this.client, "incident_history", "id", "HIST");
    const createdAt = new Date().toISOString();
    const { data, error } = await this.client
      .from("incident_history")
      .insert(toRow(input, id, createdAt))
      .select("*")
      .single();

    return fromRow(
      requireRow("saving incident history", data as HistoryRow | null, error),
    );
  }

  saveResolvedIncident(input: NewIncidentHistoryRecord) {
    return this.insert({ ...input, outcome: "resolved" });
  }

  saveFailedAttempt(input: NewIncidentHistoryRecord) {
    return this.insert({ ...input, outcome: "failed" });
  }

  async getResolvedIncidents(
    query: HistoryListQuery = {},
  ): Promise<IncidentHistoryRecord[]> {
    let request = this.client
      .from("incident_history")
      .select("*")
      .eq("outcome", "resolved")
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
    let request = this.client
      .from("incident_history")
      .select("*")
      .eq("outcome", "failed")
      .order("resolved_at", { ascending: false });

    if (typeof limit === "number") request = request.limit(limit);

    const { data, error } = await request;
    if (error) throwStorageError("listing failed history attempts", error);
    return (data as HistoryRow[] | null)?.map(fromRow) ?? [];
  }

  async getRelevantPreviousIncidents(
    query: RelevantIncidentQuery,
  ): Promise<IncidentHistoryRecord[]> {
    const limit = clampRelevantLimit(query.limit);

    // Pull a modest recent window, then score in-process (deterministic, no vectors).
    const { data, error } = await this.client
      .from("incident_history")
      .select("*")
      .eq("outcome", "resolved")
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
