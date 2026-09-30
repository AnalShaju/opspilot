/**
 * Approve -> remediate -> verify -> history, using the REAL incidentService
 * against the built-in mock simulator (no network, no DeepSeek).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  approveAndRemediate,
  createIncident,
} from "@/lib/incidents/incidentService";
import { clearIncidents, updateIncident } from "@/lib/incidents/incidentStore";
import {
  setIncidentHistoryRepository,
  setIncidentRepository,
  setResilienceTestRepository,
} from "@/lib/repositories";
import { InMemoryIncidentRepository } from "@/lib/repositories/incident.repository";
import { InMemoryIncidentHistoryRepository } from "@/lib/repositories/incident-history.repository";
import { InMemoryResilienceTestRepository } from "@/lib/repositories/resilience-test.repository";
import { mockSimulator, resetMockSimulatorState } from "@/lib/simulator/mock";
import type { Incident, RecommendedAction } from "@/lib/types/incident";

let history: InMemoryIncidentHistoryRepository;
let incidents: InMemoryIncidentRepository;
const realVerifyHealth = mockSimulator.verifyHealth;

beforeEach(() => {
  process.env.USE_MOCK_SIMULATOR = "true";
  process.env.STORAGE_DRIVER = "memory";
  history = new InMemoryIncidentHistoryRepository();
  incidents = new InMemoryIncidentRepository();
  setIncidentRepository(incidents);
  setIncidentHistoryRepository(history);
  setResilienceTestRepository(new InMemoryResilienceTestRepository());
  resetMockSimulatorState();
});

afterEach(async () => {
  mockSimulator.verifyHealth = realVerifyHealth;
  delete process.env.USE_MOCK_SIMULATOR;
  delete process.env.STORAGE_DRIVER;
  await clearIncidents();
  setIncidentRepository(null);
  setIncidentHistoryRepository(null);
  setResilienceTestRepository(null);
});

async function awaitingApproval(
  action: RecommendedAction,
  overrides: Partial<Incident> = {},
): Promise<Incident> {
  const incident = await createIncident({
    service: "Orders Service",
    title: "Orders Service Redis Failover Impact",
    description: "Orders Service degraded, Redis unhealthy",
    severity: "high",
    incidentType: "cache_failure",
  });
  const updated = await updateIncident(incident.id, {
    status: "awaiting_approval",
    incidentType: "cache_failure",
    rootCause: {
      summary: "Redis is down",
      confidence: 0.9,
      evidence: ["Redis status unhealthy"],
    },
    recommendedAction: action,
    ...overrides,
  });
  assert.ok(updated);
  return updated;
}

const restartRedis: RecommendedAction = {
  type: "restart_redis",
  target: "Redis",
  risk: "low",
  reason: "Restart Redis",
};

describe("approve -> remediate -> verify -> history", () => {
  test("verified recovery is resolved and saved to incident history", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval(restartRedis);

    const final = await approveAndRemediate(incident.id, true);

    assert.equal(final.status, "resolved");
    assert.equal(final.recovery?.executed, true);
    assert.equal(final.recovery?.verified, true);
    assert.ok(final.recovery?.verifiedAt);
    assert.ok(final.report);

    const resolved = await history.getResolvedIncidents();
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].incidentId, incident.id);
    assert.equal(resolved[0].actionType, "restart_redis");
    assert.equal(resolved[0].incidentType, "cache_failure");
    assert.equal(resolved[0].outcome, "resolved");
    assert.equal((await history.getFailedAttempts()).length, 0);
  });

  test("rollback for the Users scenario targets the Users deployment", async () => {
    mockSimulator.simulateScenario("USERS_AUTH_DEPLOYMENT");
    const incident = await awaitingApproval(
      {
        type: "rollback",
        // The model named the previous version; backend maps to the active one.
        target: "v2.2.1",
        service: "Users Service",
        risk: "medium",
        reason: "Roll back the bad auth release",
      },
      { service: "Users Service", incidentType: "deployment_regression" },
    );

    const final = await approveAndRemediate(incident.id, true);

    assert.equal(final.status, "resolved");
    assert.equal(final.recommendedAction?.target, "v2.3.0");
    assert.equal(final.recommendedAction?.service, "Users Service");
  });

  test("failed remediation is NOT saved as a learned incident", async () => {
    // Redis is failing but the recommendation is the wrong fix: simulator 400s.
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval({
      type: "recover_database",
      target: "Database",
      risk: "medium",
      reason: "Wrong fix",
    });

    await assert.rejects(() => approveAndRemediate(incident.id, true), /400/);

    const stored = await history.getResolvedIncidents();
    assert.equal(stored.length, 0, "must not be learned as resolved");
    const failed = await history.getFailedAttempts();
    assert.equal(failed.length, 1);
    assert.equal(failed[0].outcome, "failed");
    assert.deepEqual(
      await history.getRelevantPreviousIncidents({
        service: "Orders Service",
        incidentType: "cache_failure",
      }),
      [],
    );
  });

  test("failed verification is NOT saved as a learned incident", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval(restartRedis);
    // Remediation succeeds, but health still reports the incident as active.
    mockSimulator.verifyHealth = () => ({
      recovered: false,
      activeScenario: "ORDERS_REDIS_FAILURE",
      services: { Redis: "unhealthy" },
    });

    const final = await approveAndRemediate(incident.id, true);

    assert.equal(final.status, "failed");
    assert.equal(final.recovery?.executed, true);
    assert.equal(final.recovery?.verified, false);
    assert.equal((await history.getResolvedIncidents()).length, 0);
    assert.equal((await history.getFailedAttempts()).length, 1);
  });

  test("non-payment failures are not reported healthy just because payments look fine", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval(restartRedis);
    // Payment fields are healthy (errorRate 1) while Redis is still down.
    mockSimulator.verifyHealth = () => ({
      recovered: false,
      paymentService: "healthy",
      errorRate: 1,
      services: { Redis: "unhealthy", "Orders Service": "degraded" },
    });

    const final = await approveAndRemediate(incident.id, true);

    assert.equal(final.status, "failed");
  });

  test("unsupported actions are rejected before anything is executed", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval({
      type: "drop_all_tables" as never,
      target: "prod",
      risk: "high",
      reason: "nope",
    });

    await assert.rejects(
      () => approveAndRemediate(incident.id, true),
      /not allowed|Unsupported action/i,
    );

    // Simulator untouched: still failing, nothing recorded.
    assert.equal(mockSimulator.verifyHealth().activeScenario, "ORDERS_REDIS_FAILURE");
    assert.equal((await history.getResolvedIncidents()).length, 0);
    assert.equal((await history.getFailedAttempts()).length, 0);
  });

  test("declining approval executes nothing and stores nothing", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval(restartRedis);

    const final = await approveAndRemediate(incident.id, false);

    assert.equal(final.status, "failed");
    assert.equal(final.approval?.approved, false);
    assert.equal(final.recovery, undefined);
    assert.equal(mockSimulator.verifyHealth().activeScenario, "ORDERS_REDIS_FAILURE");
    assert.equal((await history.getResolvedIncidents()).length, 0);
  });

  test("approving an already-resolved incident is a no-op (no duplicate history)", async () => {
    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");
    const incident = await awaitingApproval(restartRedis);

    await approveAndRemediate(incident.id, true);
    await approveAndRemediate(incident.id, true);

    assert.equal((await history.getResolvedIncidents()).length, 1);
  });
});
