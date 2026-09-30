/**
 * Supabase-backed incident repository.
 *
 * Persists the incident document and mirrors investigation / evidence /
 * remediation into the dedicated tables. Simulator remains the evidence source;
 * this only stores what OpsPilot already collected.
 */

import type { IncidentRepository } from "@/lib/repositories/incident.repository";
import { throwStorageError, requireRow } from "@/lib/supabase/errors";
import { cloneJson, nextPrefixedId } from "@/lib/supabase/helpers";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type {
  Approval,
  Incident,
  IncidentEvidence,
  IncidentInvestigation,
  IncidentReport,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
  RecommendedAction,
  Recovery,
  RootCause,
} from "@/lib/types/incident";

type IncidentRow = {
  id: string;
  code: string;
  service: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  error_rate: number | null;
  incident_type: string | null;
  source: string | null;
  scenario_id: string | null;
  resilience_test_id: string | null;
  root_cause: RootCause | null;
  recommended_action: RecommendedAction | null;
  approval: Approval | null;
  recovery: Recovery | null;
  report: IncidentReport | null;
  investigation: IncidentInvestigation | null;
  recovery_duration_ms: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function recoveryDurationMs(incident: Incident): number | null {
  const end =
    incident.recovery?.verifiedAt ??
    (incident.status === "resolved" ? incident.updatedAt : null);
  if (!end) return null;
  const startMs = Date.parse(incident.createdAt);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return endMs - startMs;
}

function toRow(incident: Incident): IncidentRow {
  return {
    id: incident.id,
    code: incident.code,
    service: incident.service,
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    status: incident.status,
    error_rate: incident.errorRate ?? null,
    incident_type: incident.incidentType ?? null,
    source: incident.source ?? null,
    scenario_id: incident.scenarioId ?? null,
    resilience_test_id: incident.resilienceTestId ?? null,
    root_cause: incident.rootCause ? cloneJson(incident.rootCause) : null,
    recommended_action: incident.recommendedAction
      ? cloneJson(incident.recommendedAction)
      : null,
    approval: incident.approval ? cloneJson(incident.approval) : null,
    recovery: incident.recovery ? cloneJson(incident.recovery) : null,
    report: incident.report ? cloneJson(incident.report) : null,
    investigation: incident.investigation
      ? cloneJson(incident.investigation)
      : null,
    recovery_duration_ms: recoveryDurationMs(incident),
    resolved_at:
      incident.status === "resolved"
        ? (incident.recovery?.verifiedAt ?? incident.updatedAt)
        : null,
    created_at: incident.createdAt,
    updated_at: incident.updatedAt,
  };
}

function fromRow(row: IncidentRow): Incident {
  return {
    id: row.id,
    code: row.code,
    service: row.service,
    title: row.title,
    description: row.description,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    errorRate: row.error_rate ?? undefined,
    incidentType: (row.incident_type as IncidentType | null) ?? undefined,
    source: (row.source as IncidentSource | null) ?? undefined,
    scenarioId: row.scenario_id ?? undefined,
    resilienceTestId: row.resilience_test_id ?? undefined,
    rootCause: row.root_cause ?? undefined,
    recommendedAction: row.recommended_action ?? undefined,
    approval: row.approval ?? undefined,
    recovery: row.recovery ?? undefined,
    report: row.report ?? undefined,
    investigation: row.investigation ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseIncidentRepository implements IncidentRepository {
  private readonly client: OpsPilotSupabase;

  constructor(client: OpsPilotSupabase = getSupabaseAdmin()) {
    this.client = client;
  }

  async nextId(): Promise<string> {
    return nextPrefixedId(this.client, "incidents", "id", "INC");
  }

  async list(): Promise<Incident[]> {
    const { data, error } = await this.client
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throwStorageError("listing incidents", error);
    return (data as IncidentRow[] | null)?.map(fromRow) ?? [];
  }

  async getById(id: string): Promise<Incident | null> {
    const { data, error } = await this.client
      .from("incidents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throwStorageError(`loading incident ${id}`, error);
    return data ? fromRow(data as IncidentRow) : null;
  }

  async save(incident: Incident): Promise<Incident> {
    const row = toRow(incident);
    const { data, error } = await this.client
      .from("incidents")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    const saved = fromRow(
      requireRow(`saving incident ${incident.id}`, data as IncidentRow | null, error),
    );

    await this.persistEvidence(saved);
    await this.persistInvestigation(saved);
    await this.persistRemediation(saved);

    return saved;
  }

  private async persistEvidence(incident: Incident): Promise<void> {
    const evidence = incident.investigation?.evidence;
    if (!evidence) return;

    const payload = {
      incident_id: incident.id,
      logs: evidence.logs ?? null,
      metrics: evidence.metrics ?? null,
      deployments: evidence.deployments ?? null,
      services: evidence.services ?? null,
      health: (evidence.bag as IncidentEvidence["bag"])?.getHealth ?? null,
      previous_incidents: evidence.previousIncidents ?? null,
      bag: evidence.bag ?? null,
      collected_at: evidence.collectedAt,
    };

    const { error } = await this.client
      .from("incident_evidence")
      .upsert(payload, { onConflict: "incident_id" });

    if (error) throwStorageError(`saving evidence for ${incident.id}`, error);
  }

  private async persistInvestigation(incident: Incident): Promise<void> {
    const investigation = incident.investigation;
    if (!investigation) return;

    // Persist a row once we have a diagnosis OR a terminal investigation error.
    if (!incident.rootCause && !investigation.error) return;

    const action = incident.recommendedAction;
    const payload = {
      incident_id: incident.id,
      root_cause: incident.rootCause?.summary ?? null,
      confidence: incident.rootCause?.confidence ?? null,
      evidence_summary: incident.rootCause?.evidence ?? [],
      investigation_summary: investigation.summary ?? null,
      recommended_action: action?.type ?? null,
      recommended_service: action?.service ?? null,
      recommended_version: action?.target ?? null,
      recommendation_reason: action?.reason ?? null,
      ai_provider: "deepseek",
      incident_type: incident.incidentType ?? null,
      steps: investigation.steps ?? null,
      history_record_ids: investigation.historyRecordIds ?? null,
      ai_call_count: investigation.aiCallCount ?? null,
      started_at: investigation.startedAt,
      completed_at: investigation.completedAt ?? null,
      error: investigation.error ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client
      .from("incident_investigations")
      .upsert(payload, { onConflict: "incident_id" });

    if (error) {
      throwStorageError(`saving investigation for ${incident.id}`, error);
    }
  }

  private async persistRemediation(incident: Incident): Promise<void> {
    if (!incident.approval && !incident.recovery) return;

    const action = incident.recommendedAction;
    const recovery = incident.recovery;
    const payload = {
      incident_id: incident.id,
      action_type: action?.type ?? recovery?.action ?? null,
      target: action?.target ?? recovery?.target ?? null,
      service: action?.service ?? incident.service,
      risk: action?.risk ?? null,
      approved: incident.approval?.approved ?? null,
      approved_at: incident.approval?.approvedAt ?? null,
      approved_by: incident.approval?.approvedBy ?? null,
      executed: recovery?.executed ?? null,
      executed_at: recovery?.executedAt ?? null,
      result: recovery?.result ?? null,
      verified: recovery?.verified ?? null,
      verified_at: recovery?.verifiedAt ?? null,
      verification_result:
        recovery?.verified === true
          ? `${incident.service} recovered; health verification passed`
          : recovery?.verified === false
            ? "Health verification failed: service still unhealthy"
            : null,
      verification_raw: recovery?.verificationRaw ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client
      .from("remediation_actions")
      .upsert(payload, { onConflict: "incident_id" });

    if (error) {
      throwStorageError(`saving remediation for ${incident.id}`, error);
    }
  }
}
