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

async function testDemoFlow() {
  console.log("── Demo incident flow");
  const boot = await request("/api/demo/bootstrap", { method: "POST" });
  assert(boot.status === 200, `Bootstrap failed: ${JSON.stringify(boot.json)}`);
  const incidentId = boot.json.incident.id;
  console.log(`✓ Bootstrap incident (${incidentId})`);

  console.log("… DeepSeek investigation (evidence + history + ONE call)");
  const investigated = await request(`/api/incidents/${incidentId}/investigate`, {
    method: "POST",
  });
  assert(
    investigated.status === 200,
    `Investigate failed: ${investigated.status} ${JSON.stringify(investigated.json)}`,
  );
  const incident = investigated.json.incident;
  assert(incident.rootCause, "Missing AI rootCause");
  assert(incident.recommendedAction?.type, "Missing recommended action");
  assert(
    incident.investigation?.aiCallCount === 1,
    `Expected exactly 1 AI call, got ${incident.investigation?.aiCallCount}`,
  );
  console.log(
    `✓ ${incident.recommendedAction.type} ${incident.recommendedAction.target} — ${Math.round(incident.rootCause.confidence * 100)}%`,
  );
  console.log(
    `  history used: ${incident.investigation.historyRecordIds?.length ?? 0} record(s)`,
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

  await testDemoFlow();
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
