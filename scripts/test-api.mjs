/**
 * End-to-end API smoke test for OpsPilot + simulator (+ DeepSeek).
 *
 * Prerequisites:
 * - Next.js running on :3000
 * - Simulator running on SIMULATOR_URL (or USE_MOCK_SIMULATOR=true)
 * - DEEPSEEK_API_KEY set in .env.local
 *
 *   npm run test:api
 */

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

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

async function main() {
  console.log(`Testing OpsPilot AI flow at ${BASE}\n`);

  const boot = await request("/api/demo/bootstrap", { method: "POST" });
  assert(boot.status === 200, `Bootstrap failed: ${JSON.stringify(boot.json)}`);
  const incidentId = boot.json.incident.id;
  console.log(`✓ Bootstrap incident (${incidentId})`);

  console.log("… Running DeepSeek investigation (may take ~15–60s)");
  const investigated = await request(`/api/incidents/${incidentId}/investigate`, {
    method: "POST",
  });
  assert(
    investigated.status === 200,
    `Investigate failed: ${investigated.status} ${JSON.stringify(investigated.json)}`,
  );
  assert(
    investigated.json.incident.rootCause,
    "Missing AI rootCause",
  );
  assert(
    investigated.json.incident.recommendedAction?.type === "rollback",
    "Expected rollback recommendation",
  );
  console.log(
    `✓ AI diagnosis: ${investigated.json.incident.rootCause.summary} (${Math.round(investigated.json.incident.rootCause.confidence * 100)}%)`,
  );

  const approved = await request(`/api/incidents/${incidentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert(
    approved.status === 200,
    `Approve failed: ${JSON.stringify(approved.json)}`,
  );
  assert(
    approved.json.incident.status === "resolved",
    `Expected resolved, got ${approved.json.incident.status}`,
  );
  console.log("✓ Approve + rollback + verify → resolved");

  const report = await request(`/api/incidents/${incidentId}/report`);
  assert(report.status === 200, "Report failed");
  console.log("✓ Report generated");

  console.log("\nAll AI incident flow tests passed.");
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error);
  process.exit(1);
});
