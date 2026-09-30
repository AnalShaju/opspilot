/**
 * Supabase resilience_tests + resilience_test_results (LIVE schema).
 *
 * resilience_tests uses uuid `id` (exposed as testId), overall `status`,
 * and stage columns limited to pending|success|failed.
 */

import type { ResilienceTestRepository } from "@/lib/repositories/resilience-test.repository";
import { getScenario } from "@/lib/resilience/scenarios";
import { requireRow, throwStorageError } from "@/lib/supabase/errors";
import {
  msToSeconds,
  approvalStageFromDb,
  approvalStageToDb,
  overallFromDb,
  overallToDb,
  secondsToMs,
  stageFromDb,
  stageToDb,
} from "@/lib/supabase/status-map";
import { getSupabaseAdmin, type OpsPilotSupabase } from "@/lib/supabase/server";
import type { ActionType, IncidentType } from "@/lib/types/incident";
import type {
  ResilienceScenarioId,
  ResilienceTest,
} from "@/lib/types/resilience";

type TestRow = {
  id: string;
  scenario: string;
  incident_id: string | null;
  status: string;
  detection_status: string | null;
  investigation_status: string | null;
  approval_status: string | null;
  remediation_status: string | null;
  verification_status: string | null;
  recovery_duration_seconds: number | null;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const EXPECTED_SERVICE: Record<string, string> = {
  PAYMENT_DEPLOYMENT_REGRESSION: "Payment Service",
  ORDERS_REDIS_FAILURE: "Orders Service",
  USERS_AUTH_DEPLOYMENT: "Users Service",
  DATABASE_CONNECTION_EXHAUSTION: "Database",
};

function fromRow(row: TestRow): ResilienceTest {
  const scenario = getScenario(row.scenario);
  const overallStatus = overallFromDb(row.status, row.failure_reason);
  const investigationStatus = stageFromDb(row.investigation_status);

  return {
    testId: row.id,
    scenario: row.scenario as ResilienceScenarioId,
    scenarioName: scenario?.name ?? row.scenario,
    startedAt: row.started_at ?? row.created_at,
    completedAt: row.completed_at,
    incidentId: row.incident_id,
    detectionStatus: stageFromDb(row.detection_status),
    investigationStatus,
    recommendationStatus:
      investigationStatus === "passed"
        ? "passed"
        : investigationStatus === "failed"
          ? "skipped"
          : investigationStatus,
    approvalStatus: approvalStageFromDb(row.approval_status),
    remediationStatus: stageFromDb(row.remediation_status),
    verificationStatus: stageFromDb(row.verification_status),
    overallStatus,
    recoveryDurationMs: secondsToMs(row.recovery_duration_seconds),
    failureReason: row.failure_reason,
    triggeredAt: row.started_at,
    detectedAt: null,
    investigationCompletedAt: null,
    approvedAt: null,
    remediatedAt: null,
    verifiedAt: null,
    rootCauseSummary: null,
    confidence: null,
    recommendedActionType: null,
    recommendedActionTarget: null,
    remediationResult: null,
    verificationResult: null,
    evaluation: {
      expectedIncidentType: scenario?.expectedIncidentType ?? "unknown",
      expectedActionType: scenario?.expectedActionType ?? "rollback",
      actualIncidentType: null,
      actualActionType: null,
      incidentTypeMatched: null,
      actionTypeMatched: null,
    },
    approvalTimeoutMs: 10 * 60 * 1000,
  };
}

function toRow(test: ResilienceTest): Record<string, unknown> {
  return {
    id: test.testId,
    scenario: test.scenario,
    incident_id: test.incidentId,
    status: overallToDb(test.overallStatus),
    detection_status: stageToDb(test.detectionStatus),
    investigation_status: stageToDb(test.investigationStatus),
    approval_status: approvalStageToDb(test.approvalStatus),
    remediation_status: stageToDb(test.remediationStatus),
    verification_status: stageToDb(test.verificationStatus),
    recovery_duration_seconds: msToSeconds(test.recoveryDurationMs),
    failure_reason: test.failureReason,
    started_at: test.startedAt,
    completed_at: test.completedAt,
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
      scenarioName: test.scenarioName,
      rootCauseSummary: test.rootCauseSummary,
      confidence: test.confidence,
      recommendedActionTarget: test.recommendedActionTarget,
      remediationResult: test.remediationResult,
      verificationResult: test.verificationResult,
      stages: {
        detection: test.detectionStatus,
        investigation: test.investigationStatus,
        recommendation: test.recommendationStatus,
        approval: test.approvalStatus,
        remediation: test.remediationStatus,
        verification: test.verificationStatus,
      },
      timestamps: {
        triggeredAt: test.triggeredAt,
        detectedAt: test.detectedAt,
        investigationCompletedAt: test.investigationCompletedAt,
        approvedAt: test.approvedAt,
        remediatedAt: test.remediatedAt,
        verifiedAt: test.verifiedAt,
      },
    },
  };
}

function applyResultDetails(
  test: ResilienceTest,
  details: Record<string, unknown> | null,
): ResilienceTest {
  if (!details) return test;
  const evaluation = details.evaluation as ResilienceTest["evaluation"] | undefined;
  const stages = details.stages as Record<string, string> | undefined;
  const timestamps = details.timestamps as Record<string, string | null> | undefined;

  return {
    ...test,
    scenarioName:
      typeof details.scenarioName === "string"
        ? details.scenarioName
        : test.scenarioName,
    rootCauseSummary:
      typeof details.rootCauseSummary === "string"
        ? details.rootCauseSummary
        : test.rootCauseSummary,
    confidence:
      typeof details.confidence === "number" ? details.confidence : test.confidence,
    recommendedActionType:
      (details.evaluation as { actualActionType?: ActionType } | undefined)
        ?.actualActionType ??
      (typeof (details as { recommendedActionType?: string }).recommendedActionType ===
      "string"
        ? ((details as { recommendedActionType?: string })
            .recommendedActionType as ActionType)
        : test.recommendedActionType),
    recommendedActionTarget:
      typeof details.recommendedActionTarget === "string"
        ? details.recommendedActionTarget
        : test.recommendedActionTarget,
    remediationResult:
      typeof details.remediationResult === "string"
        ? details.remediationResult
        : test.remediationResult,
    verificationResult:
      typeof details.verificationResult === "string"
        ? details.verificationResult
        : test.verificationResult,
    evaluation: evaluation
      ? {
          ...test.evaluation,
          ...evaluation,
          expectedIncidentType: evaluation.expectedIncidentType as IncidentType,
          expectedActionType: evaluation.expectedActionType as ActionType,
          actualIncidentType: evaluation.actualIncidentType as IncidentType | null,
          actualActionType: evaluation.actualActionType as ActionType | null,
        }
      : test.evaluation,
    triggeredAt: timestamps?.triggeredAt ?? test.triggeredAt,
    detectedAt: timestamps?.detectedAt ?? test.detectedAt,
    investigationCompletedAt:
      timestamps?.investigationCompletedAt ?? test.investigationCompletedAt,
    approvedAt: timestamps?.approvedAt ?? test.approvedAt,
    remediatedAt: timestamps?.remediatedAt ?? test.remediatedAt,
    verifiedAt: timestamps?.verifiedAt ?? test.verifiedAt,
    recommendationStatus: stages?.recommendation
      ? stageFromDb(
          stages.recommendation === "passed"
            ? "success"
            : stages.recommendation === "failed"
              ? "failed"
              : "pending",
        )
      : test.recommendationStatus,
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
    return crypto.randomUUID();
  }

  async saveTest(test: ResilienceTest): Promise<ResilienceTest> {
    const { data, error } = await this.client
      .from("resilience_tests")
      .upsert(toRow(test), { onConflict: "id" })
      .select("*")
      .single();

    const saved = fromRow(
      requireRow(
        `saving resilience test ${test.testId}`,
        data as TestRow | null,
        error,
      ),
    );

    // Always upsert results details so mid-run timestamps/evaluation survive.
    await this.persistResult({ ...test, testId: saved.testId });

    return this.attachResultDetails({
      ...test,
      testId: saved.testId,
      overallStatus: saved.overallStatus,
    });
  }

  private async persistResult(test: ResilienceTest): Promise<void> {
    const payload = buildResultPayload(test);
    const { data: existing, error: findError } = await this.client
      .from("resilience_test_results")
      .select("id")
      .eq("test_id", test.testId)
      .maybeSingle();

    if (findError) {
      throwStorageError(`looking up resilience result ${test.testId}`, findError);
    }

    if (existing?.id) {
      const { error } = await this.client
        .from("resilience_test_results")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        throwStorageError(`updating resilience result ${test.testId}`, error);
      }
      return;
    }

    const { error } = await this.client
      .from("resilience_test_results")
      .insert(payload);
    if (error) {
      throwStorageError(`inserting resilience result ${test.testId}`, error);
    }
  }

  private async attachResultDetails(test: ResilienceTest): Promise<ResilienceTest> {
    const { data, error } = await this.client
      .from("resilience_test_results")
      .select("details, actual_action, actual_service")
      .eq("test_id", test.testId)
      .maybeSingle();

    if (error) {
      throwStorageError(`loading resilience result ${test.testId}`, error);
    }

    const details =
      data?.details && typeof data.details === "object"
        ? (data.details as Record<string, unknown>)
        : null;

    const withDetails = applyResultDetails(test, details);
    if (typeof data?.actual_action === "string") {
      withDetails.recommendedActionType = data.actual_action as ActionType;
    }
    return withDetails;
  }

  async getTestById(testId: string): Promise<ResilienceTest | null> {
    const { data, error } = await this.client
      .from("resilience_tests")
      .select("*")
      .eq("id", testId)
      .maybeSingle();

    if (error) throwStorageError(`loading resilience test ${testId}`, error);
    if (!data) return null;
    return this.attachResultDetails(fromRow(data as TestRow));
  }

  async listTests(limit?: number): Promise<ResilienceTest[]> {
    let request = this.client
      .from("resilience_tests")
      .select("*")
      .order("started_at", { ascending: false });

    if (typeof limit === "number") request = request.limit(limit);

    const { data, error } = await request;
    if (error) throwStorageError("listing resilience tests", error);
    const rows = (data as TestRow[] | null) ?? [];
    return Promise.all(rows.map((row) => this.attachResultDetails(fromRow(row))));
  }

  async findRunningTest(): Promise<ResilienceTest | null> {
    const { data, error } = await this.client
      .from("resilience_tests")
      .select("*")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throwStorageError("finding running resilience test", error);
    if (!data) return null;
    return this.attachResultDetails(fromRow(data as TestRow));
  }
}
