/**
 * Round-trip write/read against live Supabase using the app repositories.
 * Usage: node --env-file=.env.local --import ./tests/register-alias.mjs scripts/test-supabase-roundtrip.mjs
 *
 * Note: this file is plain JS that dynamically imports compiled TS via the alias loader.
 */

// Load TS via the project's alias hooks.
await import("../tests/register-alias.mjs");

const { SupabaseIncidentRepository } = await import(
  "../src/lib/repositories/supabase-incident.repository.ts"
);
const { SupabaseIncidentHistoryRepository } = await import(
  "../src/lib/repositories/supabase-incident-history.repository.ts"
);
const { SupabaseResilienceTestRepository } = await import(
  "../src/lib/repositories/supabase-resilience-test.repository.ts"
);
const { resetSupabaseAdminForTests, isSupabaseConfigured } = await import(
  "../src/lib/supabase/server.ts"
);

resetSupabaseAdminForTests();

if (!isSupabaseConfigured()) {
  console.error("Supabase is not configured in the environment.");
  process.exit(1);
}

const incidents = new SupabaseIncidentRepository();
const history = new SupabaseIncidentHistoryRepository();
const resilience = new SupabaseResilienceTestRepository();

const id = await incidents.nextId();
const now = new Date().toISOString();

console.log("Creating incident", id);
const saved = await incidents.save({
  id,
  code: id,
  service: "Payment Service",
  title: "Supabase roundtrip probe",
  description: "Connection + schema probe",
  severity: "high",
  status: "detected",
  errorRate: 50,
  source: "manual",
  incidentType: "unknown",
  createdAt: now,
  updatedAt: now,
});
console.log("✓ incident saved, status=", saved.status);

const loaded = await incidents.getById(id);
if (!loaded || loaded.title !== "Supabase roundtrip probe") {
  console.error("✗ reload mismatch", loaded);
  process.exit(1);
}
console.log("✓ incident reloaded");

const withInvestigation = await incidents.save({
  ...loaded,
  status: "awaiting_approval",
  incidentType: "deployment_regression",
  rootCause: {
    summary: "Probe root cause",
    confidence: 0.8,
    evidence: ["probe evidence A", "probe evidence B"],
  },
  recommendedAction: {
    type: "rollback",
    target: "v1.8.4",
    service: "Payment Service",
    risk: "low",
    reason: "probe reason",
  },
  investigation: {
    startedAt: now,
    completedAt: now,
    summary: "probe investigation",
    aiCallCount: 1,
    evidence: {
      collectedAt: now,
      logs: [{ level: "ERROR", message: "probe" }],
      services: [{ name: "Payment Service", status: "failing" }],
      metrics: { payment: { errorRate: 50 } },
      deployments: [{ service: "Payment Service", version: "v1.8.4", status: "active" }],
    },
  },
  updatedAt: new Date().toISOString(),
});
console.log("✓ investigation saved");

const withRemediation = await incidents.save({
  ...withInvestigation,
  status: "resolved",
  approval: {
    approved: true,
    approvedAt: new Date().toISOString(),
    approvedBy: "human",
  },
  recovery: {
    action: "rollback",
    target: "v1.8.4",
    executed: true,
    executedAt: new Date().toISOString(),
    result: "probe rollback ok",
    verified: true,
    verifiedAt: new Date().toISOString(),
  },
  updatedAt: new Date().toISOString(),
});
console.log("✓ remediation saved, status=", withRemediation.status);

const hist = await history.saveResolvedIncident({
  incidentId: id,
  incidentType: "deployment_regression",
  service: "Payment Service",
  rootCause: "Probe root cause",
  confidence: 0.8,
  evidenceSummary: ["probe evidence A"],
  recommendedAction: "rollback v1.8.4 — probe",
  actionType: "rollback",
  actionTarget: "v1.8.4",
  actionResult: "probe rollback ok",
  verificationResult: "Payment Service recovered; health verification passed",
  outcome: "resolved",
  resolvedAt: new Date().toISOString(),
  recoveryDurationMs: 12_000,
});
console.log("✓ history saved", hist.id);

const relevant = await history.getRelevantPreviousIncidents({
  service: "Payment Service",
  incidentType: "deployment_regression",
  limit: 3,
});
console.log("✓ relevant history count=", relevant.length);

const testId = await resilience.nextTestId();
const test = await resilience.saveTest({
  testId,
  scenario: "PAYMENT_DEPLOYMENT_REGRESSION",
  scenarioName: "Payment deployment regression",
  startedAt: now,
  completedAt: now,
  incidentId: id,
  detectionStatus: "passed",
  investigationStatus: "passed",
  recommendationStatus: "passed",
  approvalStatus: "passed",
  remediationStatus: "passed",
  verificationStatus: "passed",
  overallStatus: "passed",
  recoveryDurationMs: 12_000,
  failureReason: null,
  triggeredAt: now,
  detectedAt: now,
  investigationCompletedAt: now,
  approvedAt: now,
  remediatedAt: now,
  verifiedAt: now,
  rootCauseSummary: "Probe root cause",
  confidence: 0.8,
  recommendedActionType: "rollback",
  recommendedActionTarget: "v1.8.4",
  remediationResult: "probe rollback ok",
  verificationResult: "ok",
  evaluation: {
    expectedIncidentType: "deployment_regression",
    expectedActionType: "rollback",
    actualIncidentType: "deployment_regression",
    actualActionType: "rollback",
    incidentTypeMatched: true,
    actionTypeMatched: true,
  },
  approvalTimeoutMs: 600_000,
});
console.log("✓ resilience test saved", test.testId);

const reloadedTest = await resilience.getTestById(testId);
if (!reloadedTest || reloadedTest.overallStatus !== "passed") {
  console.error("✗ resilience reload failed", reloadedTest);
  process.exit(1);
}
console.log("✓ resilience test reloaded");

console.log("\nAll Supabase round-trips succeeded.");
