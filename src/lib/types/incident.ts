/**
 * Backend incident types.
 * Kept separate from frontend mock types in src/data/types.ts
 * so the UI can stay stable while the API evolves.
 */

import type { InvestigationStep } from "@/lib/types/agent";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus =
  | "detected"
  | "investigating"
  | "awaiting_approval"
  | "remediating"
  | "verifying"
  | "resolved"
  | "failed"
  | "investigation_failed";

/** Remediation actions OpsPilot is allowed to execute (after human approval). */
export const ACTION_TYPES = [
  "rollback",
  "restart_redis",
  "recover_database",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const INCIDENT_TYPES = [
  "deployment_regression",
  "cache_failure",
  "database_failure",
  "unknown",
] as const;

/** Coarse failure category used for history matching and reporting. */
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** Where an incident came from. */
export type IncidentSource = "demo" | "resilience_test" | "manual";

export type ActionRisk = "low" | "medium" | "high";

export interface RootCause {
  summary: string;
  confidence: number;
  evidence: string[];
  /** @deprecated prefer evidence */
  reasoning?: string[];
}

export interface RecommendedAction {
  type: ActionType;
  /** Deployment version for rollback; "Redis" / "Database" for the others. */
  target: string;
  /** Owning service (used by rollback, which is per-service). */
  service?: string;
  risk: ActionRisk;
  reason: string;
}

export interface Approval {
  approved: boolean;
  approvedAt: string;
  approvedBy?: string;
}

export interface Recovery {
  action: ActionType;
  target: string;
  executed: boolean;
  executedAt: string;
  result: string;
  verified?: boolean;
  /** When health verification finished (set for both success and failure). */
  verifiedAt?: string;
  paymentService?: string;
  errorRate?: number;
  paymentSuccessRate?: number;
  verificationRaw?: unknown;
}

export interface IncidentEvidence {
  logs?: unknown;
  metrics?: unknown;
  services?: unknown;
  deployments?: unknown;
  previousIncidents?: unknown;
  bag?: Record<string, unknown>;
  collectedAt: string;
}

export interface IncidentInvestigation {
  startedAt: string;
  completedAt?: string;
  steps?: InvestigationStep[];
  evidence?: IncidentEvidence;
  notes?: string[];
  error?: string;
  /** Model-written summary of the investigation. */
  summary?: string;
  /** History record ids that were given to the model as context. */
  historyRecordIds?: string[];
  /** Number of DeepSeek calls used for this investigation (always 1). */
  aiCallCount?: number;
}

export interface IncidentReport {
  incident: string;
  code?: string;
  title?: string;
  service: string;
  severity: IncidentSeverity;
  rootCause: string;
  confidence?: number;
  evidenceSummary: string[];
  action: string;
  verification: string;
  status: string;
  recoveryTime?: string;
  generatedAt: string;
}

export interface Incident {
  id: string;
  code: string;
  service: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  errorRate?: number;
  createdAt: string;
  updatedAt: string;
  incidentType?: IncidentType;
  source?: IncidentSource;
  /** Simulator scenario that produced this incident (record-keeping only). */
  scenarioId?: string;
  resilienceTestId?: string;
  investigation?: IncidentInvestigation;
  rootCause?: RootCause;
  recommendedAction?: RecommendedAction;
  approval?: Approval;
  recovery?: Recovery;
  report?: IncidentReport;
}

export interface CreateIncidentInput {
  service: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  errorRate?: number;
  incidentType?: IncidentType;
  source?: IncidentSource;
  scenarioId?: string;
  resilienceTestId?: string;
}
