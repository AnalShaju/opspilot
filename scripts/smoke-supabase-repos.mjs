/**
 * Live repository smoke: create → investigate fields → history → cleanup.
 * Usage: node --env-file=.env.local --import ./tests/register-alias.mjs scripts/smoke-supabase-repos.mjs
 */

// Load compiled-via-type-strip modules through the test alias loader by
// dynamically importing TypeScript entrypoints.
const { SupabaseIncidentRepository } = await import(
  "../src/lib/repositories/supabase-incident.repository.ts"
);
const { SupabaseIncidentHistoryRepository } = await import(
  "../src/lib/repositories/supabase-incident-history.repository.ts"
);
const { SupabaseResilienceTestRepository } = await import(
  "../src/lib/repositories/supabase-resilience-test.repository.ts"
);
const { resetSupabaseAdminForTests } = await import(
  "../src/lib/supabase/server.ts"
);

resetSupabaseAdminForTests();

const incidents = new SupabaseIncidentRepository();
const history = new SupabaseIncidentHistoryRepository();
const resilience = new SupabaseResilienceTestRepository();

const id = await incidents.nextId();
const now = new Date().toISOString();

const created = await incidents.save({
  id,
  code: id,
  service: "Payment Service",
  title: "Smoke incident",
  description: "Supabase repository smoke test",
  severity: "critical",
  status: "detected",
  incidentType: "deployment_regression",
  source: "manual",
  errorRate: 82,
  createdAt: now,
  updatedAt: now,
});
console.log("created incident", created.id, created.status);

const investigated = await incidents.save({
  ...created,
  status: "awaiting_approval",
  updatedAt: new Date().toISOString(),
  rootCause: {
    summary: "Bad payment deploy",
    confidence: 0.9,
    evidence: ["errorRate 82%", "v1.8.4 active"],
  },
  recommendedAction: {
    type: "rollback",
    target: "v1.8.4",
    service: "Payment Service",
    risk: "low",
    reason: "Roll back the failing release",
  },
  investigation: {
    startedAt: now,
    completedAt: new Date().toISOString(),
    summary: "Checked services and deployments",
    aiCallCount: 1,
    evidence: {
      collectedAt: now,
      logs: [{ level: "ERROR", message: "timeout" }],
      metrics: { errorRate: 82 },
      services: [{ name: "Payment Service", status: "failing" }],
      deployments: [{ service: "Payment Service", version: "v1.8.4", status: "active" }],
      bag: { getHealth: { recovered: false } },
    },
  },
});
console.log("investigated", investigated.status, investigated.recommendedAction?.type);

const resolvedAt = new Date().toISOString();
const resolved = await incidents.save({
  ...investigated,
  status: "resolved",
  updatedAt: resolvedAt,
  approval: { approved: true, approvedAt: resolvedAt, approvedBy: "human" },
  recovery: {
    action: "rollback",
    target: "v1.8.4",
    executed: true,
    executedAt: resolvedAt,
    result: "Rolled back",
    verified: true,
    verifiedAt: resolvedAt,
  },
});
console.log("resolved", resolved.status);

const hist = await history.saveResolvedIncident({
  incidentId: resolved.id,
  incidentType: "deployment_regression",
  service: "Payment Service",
  rootCause: "Bad payment deploy",
  confidence: 0.9,
  evidenceSummary: ["errorRate 82%"],
  recommendedAction: "rollback v1.8.4",
  actionType: "rollback",
  actionTarget: "v1.8.4",
  actionResult: "Rolled back",
  verificationResult: "Payment Service recovered",
  outcome: "resolved",
  resolvedAt,
  recoveryDurationMs: 5000,
});
console.log("history", hist.id);

const relevant = await history.getRelevantPreviousIncidents({
  service: "Payment Service",
  incidentType: "deployment_regression",
  limit: 3,
});
console.log("relevant count", relevant.length, "includes smoke?", relevant.some((r) => r.incidentId === resolved.id));

const testId = await resilience.nextTestId();
const test = await resilience.saveTest({
  testId,
  scenario: "PAYMENT_DEPLOYMENT_REGRESSION",
  scenarioName: "Payment deployment regression",
  startedAt: now,
  completedAt: resolvedAt,
  incidentId: resolved.id,
  detectionStatus: "passed",
  investigationStatus: "passed",
  recommendationStatus: "passed",
  approvalStatus: "passed",
  remediationStatus: "passed",
  verificationStatus: "passed",
  overallStatus: "passed",
  recoveryDurationMs: 5000,
  failureReason: null,
  triggeredAt: now,
  detectedAt: now,
  investigationCompletedAt: now,
  approvedAt: resolvedAt,
  remediatedAt: resolvedAt,
  verifiedAt: resolvedAt,
  rootCauseSummary: "Bad payment deploy",
  confidence: 0.9,
  recommendedActionType: "rollback",
  recommendedActionTarget: "v1.8.4",
  remediationResult: "Rolled back",
  verificationResult: "recovered",
  evaluation: {
    expectedIncidentType: "deployment_regression",
    expectedActionType: "rollback",
    actualIncidentType: "deployment_regression",
    actualActionType: "rollback",
    incidentTypeMatched: true,
    actionTypeMatched: true,
  },
  approvalTimeoutMs: 600000,
});
console.log("resilience test", test.testId, test.overallStatus);

// cleanup smoke rows (keep history? delete for cleanliness)
const { getSupabaseAdmin } = await import("../src/lib/supabase/server.ts");
const sb = getSupabaseAdmin();
await sb.from("resilience_test_results").delete().eq("test_id", testId);
await sb.from("resilience_tests").delete().eq("id", testId);
await sb.from("incident_history").delete().eq("id", hist.id);
await sb.from("remediation_actions").delete().eq("incident_id", id);
await sb.from("incident_investigations").delete().eq("incident_id", id);
await sb.from("incident_evidence").delete().eq("incident_id", id);
await sb.from("incidents").delete().eq("id", id);
console.log("cleanup done");
console.log("PASS: repository smoke against live Supabase");
