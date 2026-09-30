/**
 * Resilience tester types.
 *
 * A ResilienceTest is a record of ONE controlled failure run through the
 * normal OpsPilot incident workflow. Every stage value is derived from what
 * actually happened (see resilience-test.service.ts), never invented.
 *
 * Database-ready: flat fields, ISO-8601 timestamps, string unions.
 */

import type { ActionType, IncidentType } from "@/lib/types/incident";

export const RESILIENCE_SCENARIO_IDS = [
  "PAYMENT_DEPLOYMENT_REGRESSION",
  "ORDERS_REDIS_FAILURE",
  "USERS_AUTH_DEPLOYMENT",
  "DATABASE_CONNECTION_EXHAUSTION",
] as const;

export type ResilienceScenarioId = (typeof RESILIENCE_SCENARIO_IDS)[number];

export type StageStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "skipped";

export type ResilienceOverallStatus =
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

/**
 * Expected outcome for a scenario. Used ONLY to grade a finished run —
 * it is never fed to the investigation.
 */
export interface ResilienceScenarioDefinition {
  id: ResilienceScenarioId;
  name: string;
  description: string;
  expectedIncidentType: IncidentType;
  expectedActionType: ActionType;
}

export interface ResilienceEvaluation {
  expectedIncidentType: IncidentType;
  expectedActionType: ActionType;
  actualIncidentType: IncidentType | null;
  actualActionType: ActionType | null;
  incidentTypeMatched: boolean | null;
  actionTypeMatched: boolean | null;
}

export interface ResilienceTest {
  testId: string;
  scenario: ResilienceScenarioId;
  scenarioName: string;
  startedAt: string;
  completedAt: string | null;
  incidentId: string | null;

  detectionStatus: StageStatus;
  investigationStatus: StageStatus;
  recommendationStatus: StageStatus;
  approvalStatus: StageStatus;
  remediationStatus: StageStatus;
  verificationStatus: StageStatus;
  overallStatus: ResilienceOverallStatus;

  /** Failure injected -> recovery verified, in ms. Null until recovered. */
  recoveryDurationMs: number | null;
  failureReason: string | null;

  // Stage timestamps (ISO-8601), filled in as they happen.
  triggeredAt: string | null;
  detectedAt: string | null;
  investigationCompletedAt: string | null;
  approvedAt: string | null;
  remediatedAt: string | null;
  verifiedAt: string | null;

  // Snapshot of the investigation result (for display / history).
  rootCauseSummary: string | null;
  confidence: number | null;
  recommendedActionType: ActionType | null;
  recommendedActionTarget: string | null;
  remediationResult: string | null;
  verificationResult: string | null;

  evaluation: ResilienceEvaluation;
  /** Human approval must arrive within this window or the test fails. */
  approvalTimeoutMs: number;
}

export class ResilienceTestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ResilienceTestError";
    this.status = status;
  }
}
