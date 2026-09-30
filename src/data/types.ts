export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus =
  | "investigating"
  | "awaiting_approval"
  | "rollback_in_progress"
  | "resolved";

export type ServiceHealth = "healthy" | "degraded" | "critical" | "unknown";

export type DeploymentStatus =
  | "successful"
  | "deployed"
  | "failed"
  | "rolled_back"
  | "triggered_incident";

export type EvidenceType =
  | "logs"
  | "metrics"
  | "deployment"
  | "service_health"
  | "previous_incident";

export interface InvestigationStep {
  id: string;
  label: string;
  timestamp: string;
  completed: boolean;
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  summary: string;
  details: string[];
  timestamp?: string;
}

export interface RootCause {
  title: string;
  target: string;
  confidence: number;
  explanation: string;
}

export interface RecommendedAction {
  title: string;
  action: string;
  risk: "low" | "medium" | "high";
  reason: string;
  requiresApproval: boolean;
}

export interface RecoveryMetrics {
  errorRateBefore: number;
  errorRateAfter: number;
  paymentSuccessBefore: number;
  paymentSuccessAfter: number;
  serviceHealthAfter: ServiceHealth;
  recoveryTime: string;
}

export interface Incident {
  id: string;
  code: string;
  title: string;
  service: string;
  serviceId: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  startedLabel: string;
  durationLabel: string;
  relativeTime: string;
  errorRate: number;
  investigationSummary: string;
  investigationSteps: InvestigationStep[];
  evidence: EvidenceItem[];
  rootCause: RootCause;
  recommendedAction: RecommendedAction;
  recovery: RecoveryMetrics;
  reportId: string;
}

export interface Service {
  id: string;
  name: string;
  status: ServiceHealth;
  uptime: string;
  errorRate?: number;
  latencyMs?: number;
  owner: string;
  version: string;
  incidentId?: string;
}

export interface Deployment {
  id: string;
  version: string;
  service: string;
  serviceId: string;
  deployedAt: string;
  deployedLabel: string;
  status: DeploymentStatus;
  author: string;
  commit: string;
  notes?: string;
}

export interface IncidentReport {
  id: string;
  incidentCode: string;
  incidentId: string;
  title: string;
  service: string;
  rootCause: string;
  status: "resolved" | "open";
  recoveryTime: string;
  generatedAt: string;
  evidence: string[];
  action: string;
  result: string;
  summary: string;
}
