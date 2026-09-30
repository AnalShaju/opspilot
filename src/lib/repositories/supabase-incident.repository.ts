/**
 * Supabase-backed incident repository aligned to the LIVE schema:
 *
 * incidents(id uuid, incident_type, service, title, description, status,
 *           created_at, updated_at, resolved_at, recovery_duration_seconds)
 * incident_evidence(id, incident_id, evidence_type, data jsonb, collected_at)
 * incident_investigations(...)
 * remediation_actions(...)
 *
 * A snapshot row (evidence_type = "opspilot_snapshot") preserves fields the
 * narrow incidents table cannot hold (severity, source, report, ...).
 */

import type { IncidentRepository } from "@/lib/repositories/incident.repository";
import { requireRow, throwStorageError } from "@/lib/supabase/errors";
import {
  incidentStatusFromDb,
  incidentStatusToDb,
  msToSeconds,
} from "@/lib/supabase/status-map";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type {
  Incident,
  IncidentSeverity,
  IncidentType,
} from "@/lib/types/incident";

const SNAPSHOT_TYPE = "other";
const SNAPSHOT_KIND = "opspilot_snapshot";

const EVIDENCE_TYPE_MAP: Record<string, string> = {
  logs: "logs",
  metrics: "metrics",
  deployments: "deployment",
  services: "service_status",
  health: "health",
  previous_incidents: "other",
};

type IncidentRow = {
  id: string;
  incident_type: string;
  service: string;
  title: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  recovery_duration_seconds: number | null;
};

type EvidenceRow = {
  id: string;
  incident_id: string;
  evidence_type: string;
  data: unknown;
  collected_at: string;
};

type RemediationRow = {
  id: string;
  incident_id: string;
  investigation_id: string | null;
  action_type: string;
  service: string | null;
  version: string | null;
  approval_status: string;
  execution_status: string;
  execution_result: Record<string, unknown> | null;
  approved_at: string | null;
  executed_at: string | null;
  created_at: string;
};

function recoveryDurationSeconds(incident: Incident): number | null {
  const end =
    incident.recovery?.verifiedAt ??
    (incident.status === "resolved" ? incident.updatedAt : null);
  if (!end) return null;
  const startMs = Date.parse(incident.createdAt);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return msToSeconds(endMs - startMs);
}

function toIncidentRow(incident: Incident): Record<string, unknown> {
  return {
    id: incident.id,
    incident_type: incident.incidentType ?? "unknown",
    service: incident.service,
    title: incident.title,
    description: incident.description,
    status: incidentStatusToDb(incident.status),
    created_at: incident.createdAt,
    updated_at: incident.updatedAt,
    resolved_at:
      incident.status === "resolved"
        ? (incident.recovery?.verifiedAt ?? incident.updatedAt)
        : null,
    recovery_duration_seconds: recoveryDurationSeconds(incident),
  };
}

function snapshotPayload(incident: Incident): Record<string, unknown> {
  return {
    code: incident.code,
    severity: incident.severity,
    errorRate: incident.errorRate,
    source: incident.source,
    scenarioId: incident.scenarioId,
    resilienceTestId: incident.resilienceTestId,
    incidentType: incident.incidentType,
    rootCause: incident.rootCause,
    recommendedAction: incident.recommendedAction,
    approval: incident.approval,
    recovery: incident.recovery,
    report: incident.report,
    investigation: incident.investigation,
    appStatus: incident.status,
  };
}

function applySnapshot(
  base: Incident,
  snapshot: Record<string, unknown> | null,
): Incident {
  if (!snapshot) return base;
  return {
    ...base,
    code: typeof snapshot.code === "string" ? snapshot.code : base.code,
    severity:
      typeof snapshot.severity === "string"
        ? (snapshot.severity as IncidentSeverity)
        : base.severity,
    errorRate:
      typeof snapshot.errorRate === "number" ? snapshot.errorRate : base.errorRate,
    source:
      typeof snapshot.source === "string"
        ? (snapshot.source as Incident["source"])
        : base.source,
    scenarioId:
      typeof snapshot.scenarioId === "string" ? snapshot.scenarioId : base.scenarioId,
    resilienceTestId:
      typeof snapshot.resilienceTestId === "string"
        ? snapshot.resilienceTestId
        : base.resilienceTestId,
    incidentType:
      (snapshot.incidentType as IncidentType | undefined) ?? base.incidentType,
    rootCause:
      (snapshot.rootCause as Incident["rootCause"]) ?? base.rootCause,
    recommendedAction:
      (snapshot.recommendedAction as Incident["recommendedAction"]) ??
      base.recommendedAction,
    approval: (snapshot.approval as Incident["approval"]) ?? base.approval,
    recovery: (snapshot.recovery as Incident["recovery"]) ?? base.recovery,
    report: (snapshot.report as Incident["report"]) ?? base.report,
    investigation:
      (snapshot.investigation as Incident["investigation"]) ??
      base.investigation,
    status:
      typeof snapshot.appStatus === "string"
        ? (snapshot.appStatus as Incident["status"])
        : base.status,
  };
}

export class SupabaseIncidentRepository implements IncidentRepository {
  private readonly client: OpsPilotSupabase;

  constructor(client: OpsPilotSupabase = getSupabaseAdmin()) {
    this.client = client;
  }

  async nextId(): Promise<string> {
    return crypto.randomUUID();
  }

  async list(): Promise<Incident[]> {
    const { data, error } = await this.client
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throwStorageError("listing incidents", error);
    const rows = (data as IncidentRow[] | null) ?? [];
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async getById(id: string): Promise<Incident | null> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return null;
    }

    const { data, error } = await this.client
      .from("incidents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throwStorageError(`loading incident ${id}`, error);
    if (!data) return null;
    return this.hydrate(data as IncidentRow);
  }

  async save(incident: Incident): Promise<Incident> {
    const row = toIncidentRow(incident);
    const { data, error } = await this.client
      .from("incidents")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    const savedRow = requireRow(
      `saving incident ${incident.id}`,
      data as IncidentRow | null,
      error,
    );

    await this.persistSnapshot(incident);
    await this.persistEvidenceBundle(incident);
    await this.persistInvestigation(incident);
    await this.persistRemediation(incident);

    return this.hydrate(savedRow);
  }

  private async hydrate(row: IncidentRow): Promise<Incident> {
    const { data: evidence, error: evidenceError } = await this.client
      .from("incident_evidence")
      .select("*")
      .eq("incident_id", row.id);

    if (evidenceError) {
      throwStorageError(`loading evidence for ${row.id}`, evidenceError);
    }

    const evidenceRows = (evidence as EvidenceRow[] | null) ?? [];
    const snapshotRow = evidenceRows.find(
      (item) =>
        item.evidence_type === SNAPSHOT_TYPE &&
        item.data &&
        typeof item.data === "object" &&
        (item.data as { kind?: string }).kind === SNAPSHOT_KIND,
    );
    const snapshot =
      snapshotRow && snapshotRow.data && typeof snapshotRow.data === "object"
        ? ((snapshotRow.data as { payload?: Record<string, unknown> }).payload ??
          null)
        : null;

    const { data: remediation } = await this.client
      .from("remediation_actions")
      .select("*")
      .eq("incident_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const remediationRow = remediation as RemediationRow | null;

    const verifying =
      row.status === "remediating" &&
      remediationRow?.execution_status === "success" &&
      remediationRow.execution_result?.verified == null;

    const investigationFailed =
      row.status === "failed" &&
      Boolean(snapshot?.investigation && (snapshot.investigation as { error?: string }).error) &&
      !remediationRow;

    const base: Incident = {
      id: row.id,
      code: row.id,
      service: row.service,
      title: row.title ?? "Incident",
      description: row.description ?? "",
      severity: "high",
      status: incidentStatusFromDb(row.status, {
        verifying,
        investigationFailed,
      }),
      incidentType: (row.incident_type as IncidentType) || "unknown",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return applySnapshot(base, snapshot);
  }

  private async persistSnapshot(incident: Incident): Promise<void> {
    const collectedAt =
      incident.investigation?.evidence?.collectedAt ?? incident.updatedAt;
    await this.upsertEvidence(
      incident.id,
      SNAPSHOT_TYPE,
      { kind: SNAPSHOT_KIND, payload: snapshotPayload(incident) },
      collectedAt,
      SNAPSHOT_KIND,
    );
  }

  private async persistEvidenceBundle(incident: Incident): Promise<void> {
    const evidence = incident.investigation?.evidence;
    if (!evidence) return;
    const collectedAt = evidence.collectedAt;
    const bag = (evidence.bag ?? {}) as Record<string, unknown>;

    const entries: Array<[string, unknown, string | undefined]> = [
      ["logs", evidence.logs ?? bag.getLogs, undefined],
      ["metrics", evidence.metrics ?? bag.getMetrics, undefined],
      ["deployments", evidence.deployments ?? bag.getDeployments, undefined],
      ["services", evidence.services ?? bag.getServices, undefined],
      ["health", bag.getHealth, undefined],
      [
        "previous_incidents",
        evidence.previousIncidents ?? bag.getPreviousIncidents,
        "previous_incidents",
      ],
    ];

    for (const [logicalType, data, kind] of entries) {
      if (data == null) continue;
      const dbType = EVIDENCE_TYPE_MAP[logicalType] ?? "other";
      const payload = kind ? { kind, value: data } : data;
      await this.upsertEvidence(
        incident.id,
        dbType,
        payload,
        collectedAt,
        kind,
      );
    }
  }

  private async upsertEvidence(
    incidentId: string,
    evidenceType: string,
    data: unknown,
    collectedAt: string,
    kind?: string,
  ): Promise<void> {
    const existingQuery = this.client
      .from("incident_evidence")
      .select("id, data")
      .eq("incident_id", incidentId)
      .eq("evidence_type", evidenceType);

    const { data: rows, error: findError } = await existingQuery;
    if (findError) {
      throwStorageError(`looking up evidence ${evidenceType}`, findError);
    }

    const existing = (rows as EvidenceRow[] | null)?.find((row) => {
      if (!kind) return true;
      return (
        row.data &&
        typeof row.data === "object" &&
        (row.data as { kind?: string }).kind === kind
      );
    });

    if (existing?.id) {
      const { error } = await this.client
        .from("incident_evidence")
        .update({ data, collected_at: collectedAt })
        .eq("id", existing.id);
      if (error) throwStorageError(`updating evidence ${evidenceType}`, error);
      return;
    }

    const { error } = await this.client.from("incident_evidence").insert({
      incident_id: incidentId,
      evidence_type: evidenceType,
      data,
      collected_at: collectedAt,
    });
    if (error) throwStorageError(`inserting evidence ${evidenceType}`, error);
  }

  private async persistInvestigation(incident: Incident): Promise<void> {
    const investigation = incident.investigation;
    if (!investigation) return;
    if (!incident.rootCause && !investigation.error) return;

    const payload = {
      incident_id: incident.id,
      root_cause: incident.rootCause?.summary ?? investigation.error ?? null,
      confidence: incident.rootCause?.confidence ?? null,
      evidence_summary: (incident.rootCause?.evidence ?? []).join("\n"),
      investigation_summary: investigation.summary ?? null,
      recommended_action_type: incident.recommendedAction?.type ?? null,
      recommended_service: incident.recommendedAction?.service ?? null,
      recommended_version: incident.recommendedAction?.target ?? null,
      recommended_reason: incident.recommendedAction?.reason ?? null,
      ai_provider: "deepseek",
    };

    const { data: existing, error: findError } = await this.client
      .from("incident_investigations")
      .select("id")
      .eq("incident_id", incident.id)
      .maybeSingle();

    if (findError) {
      throwStorageError("looking up investigation", findError);
    }

    if (existing?.id) {
      const { error } = await this.client
        .from("incident_investigations")
        .update(payload)
        .eq("id", existing.id);
      if (error) throwStorageError("updating investigation", error);
      return;
    }

    const { error } = await this.client
      .from("incident_investigations")
      .insert(payload);
    if (error) throwStorageError("inserting investigation", error);
  }

  private async persistRemediation(incident: Incident): Promise<void> {
    if (!incident.approval && !incident.recovery) return;

    const action = incident.recommendedAction;
    const recovery = incident.recovery;
    const approval = incident.approval;

    let approvalStatus = "pending";
    if (approval?.approved === true) approvalStatus = "approved";
    if (approval?.approved === false) approvalStatus = "rejected";

    let executionStatus = "pending";
    if (recovery?.executed === false) executionStatus = "failed";
    else if (recovery?.verified === true) executionStatus = "success";
    else if (recovery?.verified === false) executionStatus = "success";
    else if (recovery?.executed === true) {
      executionStatus =
        incident.status === "remediating" ? "running" : "success";
    } else if (incident.status === "remediating") {
      executionStatus = "running";
    }

    const executionResult = recovery
      ? {
          message: recovery.result,
          target: recovery.target,
          executed: recovery.executed,
          verified: recovery.verified,
          verifiedAt: recovery.verifiedAt,
          verificationRaw: recovery.verificationRaw,
          paymentService: recovery.paymentService,
          errorRate: recovery.errorRate,
          paymentSuccessRate: recovery.paymentSuccessRate,
        }
      : null;

    const payload = {
      incident_id: incident.id,
      action_type: action?.type ?? recovery?.action ?? "rollback",
      service: action?.service ?? incident.service,
      version: action?.target ?? recovery?.target ?? null,
      approval_status: approvalStatus,
      execution_status: executionStatus,
      execution_result: executionResult,
      approved_at: approval?.approvedAt ?? null,
      executed_at: recovery?.executedAt ?? null,
    };

    const { data: existing, error: findError } = await this.client
      .from("remediation_actions")
      .select("id")
      .eq("incident_id", incident.id)
      .maybeSingle();

    if (findError) throwStorageError("looking up remediation", findError);

    if (existing?.id) {
      const { error } = await this.client
        .from("remediation_actions")
        .update(payload)
        .eq("id", existing.id);
      if (error) throwStorageError("updating remediation", error);
      return;
    }

    const { error } = await this.client.from("remediation_actions").insert(payload);
    if (error) throwStorageError("inserting remediation", error);
  }
}
