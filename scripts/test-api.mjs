/**
 * End-to-end API smoke test for OpsPilot + simulator + DeepSeek.
 *
 * Prerequisites:
 * - Next.js running on :3000
 * - Simulator running on SIMULATOR_URL (or USE_MOCK_SIMULATOR=true)
 * - DEEPSEEK_API_KEY set in .env.local
 *
 *   npm run test:api
 *
 * Optional: RESILIENCE_SCENARIOS=ORDERS_REDIS_FAILURE,USERS_AUTH_DEPLOYMENT
 * to limit which resilience scenarios run (default: all four).
 */

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ALL_SCENARIOS = [
  "PAYMENT_DEPLOYMENT_REGRESSION",
  "ORDERS_REDIS_FAILURE",
  "USERS_AUTH_DEPLOYMENT",
  "DATABASE_CONNECTION_EXHAUSTION",
];
const SCENARIOS = process.env.RESILIENCE_SCENARIOS
  ? process.env.RESILIENCE_SCENARIOS.split(",").map((s) => s.trim())
  : ALL_SCENARIOS;

async function request(path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, fn, timeoutMs = 120_000, intervalMs = 1000) {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await sleep(intervalMs);
  }
}

async function testDynamicIncidentFlow() {
  console.log("── Dynamic incident flow (NOT payment-default)");
  // Trigger a Redis failure via the public resilience trigger so we prove
  // OpsPilot follows the simulator, not a hardcoded Payment incident.
  const started = await request("/api/resilience-tests", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "ORDERS_REDIS_FAILURE" }),
  });
  assert(
    started.status === 201,
    `Trigger failed: ${started.status} ${JSON.stringify(started.json)}`,
  );
  const incidentId = started.json.test.incidentId;
  assert(incidentId, "Missing incidentId from resilience trigger");
  console.log(`✓ Simulator Redis failure synced as incident (${incidentId})`);

  const listed = await request("/api/incidents");
  assert(listed.status === 200, "List incidents failed");
  const listedIncident = listed.json.incidents.find((i) => i.id === incidentId);
  assert(listedIncident, "Triggered incident missing from /api/incidents");
  assert(
    /redis|orders/i.test(listedIncident.service),
    `Expected Redis/Orders service, got ${listedIncident.service}`,
  );
  console.log(`✓ Incident list shows ${listedIncident.service} (not forced Payment)`);

  const awaiting = await waitFor("investigation to finish", async () => {
    const { json } = await request(`/api/incidents/${incidentId}`);
    const incident = json.incident;
    if (incident.status === "investigation_failed") {
      throw new Error(`Investigation failed: ${incident.investigation?.error}`);
    }
    return incident.status === "awaiting_approval" ? incident : null;
  });

  assert(awaiting.rootCause, "Missing AI rootCause");
  assert(awaiting.recommendedAction?.type, "Missing recommended action");
  assert(
    awaiting.investigation?.aiCallCount === 1,
    `Expected exactly 1 AI call, got ${awaiting.investigation?.aiCallCount}`,
  );
  assert(
    awaiting.recommendedAction.type === "restart_redis",
    `Expected restart_redis for Redis failure, got ${awaiting.recommendedAction.type}`,
  );
  console.log(
    `✓ ${awaiting.recommendedAction.type} ${awaiting.recommendedAction.target} — ${Math.round(awaiting.rootCause.confidence * 100)}%`,
  );
  console.log(
    `  history used: ${awaiting.investigation.historyRecordIds?.length ?? 0} record(s)`,
  );

  const approved = await request(`/api/incidents/${incidentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert(approved.status === 200, `Approve failed: ${JSON.stringify(approved.json)}`);
  assert(
    approved.json.incident.status === "resolved",
    `Expected resolved, got ${approved.json.incident.status}`,
  );
  console.log("✓ Approve + remediation + verification → resolved");

  const report = await request(`/api/incidents/${incidentId}/report`);
  assert(report.status === 200, "Report failed");
  console.log("✓ Report generated");

  const history = await request("/api/incidents/history");
  assert(history.status === 200, "History list failed");
  const saved = history.json.records.find((r) => r.incidentId === incidentId);
  assert(saved, "Resolved incident was not saved to history");
  assert(
    saved.actionType === "restart_redis",
    `History should record restart_redis, got ${saved.actionType}`,
  );
  console.log(`✓ Saved to history (${saved.id}: ${saved.actionType} ${saved.actionTarget})`);

  const one = await request(`/api/incidents/history/${saved.id}`);
  assert(one.status === 200, "History detail failed");
  const missing = await request("/api/incidents/history/nope");
  assert(missing.status === 404, "Missing history id should 404");
  console.log("✓ History detail + 404");
}

async function testResilience(scenarioId) {
  console.log(`── Resilience: ${scenarioId}`);
  const started = await request("/api/resilience-tests", {
    method: "POST",
    body: JSON.stringify({ scenarioId }),
  });
  assert(
    started.status === 201,
    `Start failed: ${started.status} ${JSON.stringify(started.json)}`,
  );
  const { testId } = started.json.test;
  assert(started.json.test.detectionStatus === "passed", "Not detected");
  console.log(`✓ Triggered + detected (${testId})`);

  const second = await request("/api/resilience-tests", {
    method: "POST",
    body: JSON.stringify({ scenarioId }),
  });
  assert(second.status === 409, "Second concurrent test should be rejected (409)");

  const awaiting = await waitFor("investigation to finish", async () => {
    const { json } = await request(`/api/resilience-tests/${testId}`);
    const test = json.test;
    if (test.overallStatus !== "running") {
      throw new Error(
        `Test ended early: ${test.overallStatus} — ${test.failureReason}`,
      );
    }
    return test.approvalStatus === "in_progress" ? test : null;
  });
  console.log(
    `✓ Investigated: ${awaiting.recommendedActionType} ${awaiting.recommendedActionTarget} — ${awaiting.rootCauseSummary}`,
  );

  const approved = await request(`/api/incidents/${awaiting.incidentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert(approved.status === 200, `Approve failed: ${JSON.stringify(approved.json)}`);

  const final = (await request(`/api/resilience-tests/${testId}`)).json.test;
  assert(
    final.overallStatus === "passed",
    `Expected PASSED, got ${final.overallStatus}: ${final.failureReason}`,
  );
  assert(final.recoveryDurationMs > 0, "Missing recovery duration");
  console.log(
    `✓ PASSED in ${Math.round(final.recoveryDurationMs / 1000)}s ` +
      `(type ${final.evaluation.incidentTypeMatched ? "✓" : "≠"} expected, ` +
      `action ${final.evaluation.actionTypeMatched ? "✓" : "≠"} expected)`,
  );
}

async function main() {
  console.log(`Testing OpsPilot at ${BASE}\n`);

  await testDynamicIncidentFlow();
  console.log("");

  for (const scenario of SCENARIOS) {
    await testResilience(scenario);
    console.log("");
  }

  const list = await request("/api/resilience-tests");
  assert(list.status === 200, "Resilience list failed");
  assert(list.json.scenarios.length === 4, "Expected 4 scenarios");

  const history = await request("/api/incidents/history");
  console.log(`History now holds ${history.json.records.length} resolved incident(s).`);
  console.log("\nAll incident + history + resilience tests passed.");
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error);
  process.exit(1);
});
