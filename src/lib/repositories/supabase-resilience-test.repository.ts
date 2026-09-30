/**
 * Supabase implementation of ResilienceTestRepository.
 * Also writes resilience_test_results when a run finishes.
 */

import type { ResilienceTestRepository } from "@/lib/repositories/resilience-test.repository";
import { requireRow, throwStorageError } from "@/lib/supabase/errors";
import { cloneJson, nextPrefixedId } from "@/lib/supabase/helpers";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type {
  ResilienceEvaluation,
  ResilienceOverallStatus,
  ResilienceScenarioId,
  ResilienceTest,
  StageStatus,
} from "@/lib/types/resilience";
import type { ActionType, IncidentType } from "@/lib/types/incident";

type TestRow = {
  test_id: string;
  scenario: string;
  scenario_name: string;
  started_at: string;
  completed_at: string | null;
  incident_id: string | null;
  detection_status: string;
  investigation_status: string;
  recommendation_status: string;
  approval_status: string;
  remediation_status: string;
  verification_status: string;
  overall_status: string;
  recovery_duration_ms: number | null;
  failure_reason: string | null;
  triggered_at: string | null;
  detected_at: string | null;
  investigation_completed_at: string | null;
  approved_at: string | null;
  remediated_at: string | null;
  verified_at: string | null;
  root_cause_summary: string | null;
  confidence: number | null;
  recommended_action_type: string | null;
  recommended_action_target: string | null;
  remediation_result: string | null;
  verification_result: string | null;
  evaluation: ResilienceEvaluation;
  approval_timeout_ms: number;
};

const EXPECTED_SERVICE: Record<string, string> = {
  PAYMENT_DEPLOYMENT_REGRESSION: "Payment Service",
  ORDERS_REDIS_FAILURE: "Orders Service",
  USERS_AUTH_DEPLOYMENT: "Users Service",
  DATABASE_CONNECTION_EXHAUSTION: "Database",
};

function toRow(test: ResilienceTest): TestRow {
  return {
    test_id: test.testId,
    scenario: test.scenario,
    scenario_name: test.scenarioName,
    started_at: test.startedAt,
    completed_at: test.completedAt,
    incident_id: test.incidentId,
    detection_status: test.detectionStatus,
    investigation_status: test.investigationStatus,
    recommendation_status: test.recommendationStatus,
    approval_status: test.approvalStatus,
    remediation_status: test.remediationStatus,
    verification_status: test.verificationStatus,
    overall_status: test.overallStatus,
    recovery_duration_ms: test.recoveryDurationMs,
    failure_reason: test.failureReason,
    triggered_at: test.triggeredAt,
    detected_at: test.detectedAt,
    investigation_completed_at: test.investigationCompletedAt,
    approved_at: test.approvedAt,
    remediated_at: test.remediatedAt,
    verified_at: test.verifiedAt,
    root_cause_summary: test.rootCauseSummary,
    confidence: test.confidence,
    recommended_action_type: test.recommendedActionType,
    recommended_action_target: test.recommendedActionTarget,
    remediation_result: test.remediationResult,
    verification_result: test.verificationResult,
    evaluation: cloneJson(test.evaluation),
    approval_timeout_ms: test.approvalTimeoutMs,
  };
}

function fromRow(row: TestRow): ResilienceTest {
  return {
    testId: row.test_id,
    scenario: row.scenario as ResilienceScenarioId,
    scenarioName: row.scenario_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    incidentId: row.incident_id,
    detectionStatus: row.detection_status as StageStatus,
    investigationStatus: row.investigation_status as StageStatus,
    recommendationStatus: row.recommendation_status as StageStatus,
    approvalStatus: row.approval_status as StageStatus,
    remediationStatus: row.remediation_status as StageStatus,
    verificationStatus: row.verification_status as StageStatus,
    overallStatus: row.overall_status as ResilienceOverallStatus,
    recoveryDurationMs: row.recovery_duration_ms,
    failureReason: row.failure_reason,
    triggeredAt: row.triggered_at,
    detectedAt: row.detected_at,
    investigationCompletedAt: row.investigation_completed_at,
    approvedAt: row.approved_at,
    remediatedAt: row.remediated_at,
    verifiedAt: row.verified_at,
    rootCauseSummary: row.root_cause_summary,
    confidence: row.confidence,
    recommendedActionType: row.recommended_action_type as ActionType | null,
    recommendedActionTarget: row.recommended_action_target,
    remediationResult: row.remediation_result,
    verificationResult: row.verification_result,
    evaluation: {
      expectedIncidentType: row.evaluation
        .expectedIncidentType as IncidentType,
      expectedActionType: row.evaluation.expectedActionType as ActionType,
      actualIncidentType:
        (row.evaluation.actualIncidentType as IncidentType | null) ?? null,
      actualActionType:
        (row.evaluation.actualActionType as ActionType | null) ?? null,
      incidentTypeMatched: row.evaluation.incidentTypeMatched ?? null,
      actionTypeMatched: row.evaluation.actionTypeMatched ?? null,
    },
    approvalTimeoutMs: row.approval_timeout_ms,
  };
}

function buildResultPayload(test: ResilienceTest) {
  const expectedService = EXPECTED_SERVICE[test.scenario] ?? null;
  const actualService =
    test.recommendedActionType === "restart_redis"
      ? "Redis"
      : test.recommendedActionType === "recover_database"
        ? "Database"
        : expectedService;

  return {
    test_id: test.testId,
    expected_action: test.evaluation.expectedActionType,
    actual_action: test.recommendedActionType,
    expected_service: expectedService,
    actual_service: actualService,
    detection_success: test.detectionStatus === "passed",
    investigation_success: test.investigationStatus === "passed",
    remediation_success: test.remediationStatus === "passed",
    verification_success: test.verificationStatus === "passed",
    details: {
      overallStatus: test.overallStatus,
      failureReason: test.failureReason,
      recoveryDurationMs: test.recoveryDurationMs,
      incidentId: test.incidentId,
      evaluation: test.evaluation,
      stages: {
        detection: test.detectionStatus,
        investigation: test.investigationStatus,
        recommendation: test.recommendationStatus,
        approval: test.approvalStatus,
        remediation: test.remediationStatus,
        verification: test.verificationStatus,
      },
      rootCauseSummary: test.rootCauseSummary,
      confidence: test.confidence,
      remediationResult: test.remediationResult,
      verificationResult: test.verificationResult,
    },
  };
}

export class SupabaseResilienceTestRepository
  implements ResilienceTestRepository
{
  private readonly client: OpsPilotSupabase;

  constructor(client: OpsPilotSupabase = getSupabaseAdmin()) {
    this.client = client;
  }

  async nextTestId(): Promise<string> {
    return nextPrefixedId(this.client, "resilience_tests", "test_id", "RT");
  }

  async saveTest(test: ResilienceTest): Promise<ResilienceTest> {
    const row = {
      ...toRow(test),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from("resilience_tests")
      .upsert(row, { onConflict: "test_id" })
      .select("*")
      .single();

    const saved = fromRow(
      requireRow(`saving resilience test ${test.testId}`, data as TestRow | null, error),
    );

    if (saved.overallStatus !== "running") {
      await this.persistResult(saved);
    }

    return saved;
  }

  private async persistResult(test: ResilienceTest): Promise<void> {
    const { error } = await this.client
      .from("resilience_test_results")
      .upsert(buildResultPayload(test), { onConflict: "test_id" });

    if (error) {
      throwStorageError(`saving resilience result for ${test.testId}`, error);
    }
  }

  async getTestById(testId: string): Promise<ResilienceTest | null> {
    const { data, error } = await this.client
      .from("resilience_tests")
      .select("*")
      .eq("test_id", testId)
      .maybeSingle();

    if (error) throwStorageError(`loading resilience test ${testId}`, error);
    return data ? fromRow(data as TestRow) : null;
  }

  async listTests(limit?: number): Promise<ResilienceTest[]> {
    let request = this.client
      .from("resilience_tests")
      .select("*")
      .order("started_at", { ascending: false });

    if (typeof limit === "number") request = request.limit(limit);

    const { data, error } = await request;
    if (error) throwStorageError("listing resilience tests", error);
    return (data as TestRow[] | null)?.map(fromRow) ?? [];
  }

  async findRunningTest(): Promise<ResilienceTest | null> {
    const { data, error } = await this.client
      .from("resilience_tests")
      .select("*")
      .eq("overall_status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throwStorageError("finding running resilience test", error);
    return data ? fromRow(data as TestRow) : null;
  }
}
