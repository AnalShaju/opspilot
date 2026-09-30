import type {
  ActionRisk,
  ActionType,
  IncidentType,
} from "@/lib/types/incident";
import type { IncidentHistoryRecord } from "@/lib/types/history";

/**
 * Evidence sources gathered by the backend BEFORE the single DeepSeek call.
 * (DeepSeek never calls these itself.)
 */
export type InvestigationToolName =
  | "getServices"
  | "getLogs"
  | "getMetrics"
  | "getDeployments"
  | "getHealth"
  | "getPreviousIncidents"
  | "getIncidentHistory";

export interface InvestigationStep {
  tool: InvestigationToolName;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  summary?: string;
  error?: string;
}

export interface AgentRootCause {
  summary: string;
  confidence: number;
  evidence: string[];
}

export interface AgentRecommendedAction {
  type: ActionType;
  target: string;
  service?: string;
  risk: ActionRisk;
  reason: string;
}

export interface AgentDiagnosis {
  rootCause: AgentRootCause;
  incidentType: IncidentType;
  recommendedAction: AgentRecommendedAction;
  investigationSummary: string;
}

export interface AgentInvestigationResult {
  diagnosis: AgentDiagnosis;
  steps: InvestigationStep[];
  evidenceBag: Record<string, unknown>;
  rawFinalContent: string;
  /** Preliminary type derived from raw signals before the model call. */
  detectedIncidentType: IncidentType;
  /** Previous resolved incidents supplied to the model as context. */
  historyUsed: IncidentHistoryRecord[];
  /** DeepSeek calls made for this investigation. Always exactly 1. */
  aiCallCount: 1;
}

export class AgentError extends Error {
  code: string;

  constructor(message: string, code = "AGENT_ERROR") {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}
