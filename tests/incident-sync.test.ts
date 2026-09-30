/**
 * Sync must follow currently-open simulator incidents — never keep a stale
 * Payment (or other) awaiting_approval row as the "active" production incident.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  createIncident,
  matchesSimulatorIncident,
  syncIncidentsFromSimulator,
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

beforeEach(() => {
  process.env.USE_MOCK_SIMULATOR = "true";
  process.env.STORAGE_DRIVER = "memory";
  setIncidentRepository(new InMemoryIncidentRepository());
  setIncidentHistoryRepository(new InMemoryIncidentHistoryRepository());
  setResilienceTestRepository(new InMemoryResilienceTestRepository());
  resetMockSimulatorState();
});

afterEach(async () => {
  delete process.env.USE_MOCK_SIMULATOR;
  delete process.env.STORAGE_DRIVER;
  await clearIncidents();
  setIncidentRepository(null);
  setIncidentHistoryRepository(null);
  setResilienceTestRepository(null);
});

describe("matchesSimulatorIncident", () => {
  test("matches by simulatorIncidentId even when progressed", () => {
    assert.equal(
      matchesSimulatorIncident(
        {
          id: "a",
          code: "a",
          service: "Orders Service",
          title: "x",
          description: "x",
          severity: "high",
          status: "awaiting_approval",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          simulatorIncidentId: "INC-001",
          scenarioId: "ORDERS_REDIS_FAILURE",
        },
        {
          id: "INC-001",
          service: "Orders Service",
          scenario: "ORDERS_REDIS_FAILURE",
          status: "open",
        },
      ),
      true,
    );
  });

  test("rejects terminal incidents even when simulatorIncidentId matches", () => {
    assert.equal(
      matchesSimulatorIncident(
        {
          id: "a",
          code: "a",
          service: "Users Service",
          title: "x",
          description: "x",
          severity: "high",
          status: "failed",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          simulatorIncidentId: "INC-001",
          scenarioId: "USERS_AUTH_DEPLOYMENT",
        },
        {
          id: "INC-001",
          service: "Users Service",
          scenario: "USERS_AUTH_DEPLOYMENT",
          status: "open",
        },
      ),
      false,
    );
  });

  test("rejects recycled simulatorIncidentId when scenario differs", () => {
    assert.equal(
      matchesSimulatorIncident(
        {
          id: "a",
          code: "a",
          service: "Payment Service",
          title: "x",
          description: "x",
          severity: "high",
          status: "detected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          simulatorIncidentId: "INC-001",
          scenarioId: "PAYMENT_DEPLOYMENT_REGRESSION",
        },
        {
          id: "INC-001",
          service: "Orders Service",
          scenario: "ORDERS_REDIS_FAILURE",
          status: "open",
        },
      ),
      false,
    );
  });

  test("does not reuse awaiting_approval without simulatorIncidentId", () => {
    assert.equal(
      matchesSimulatorIncident(
        {
          id: "a",
          code: "a",
          service: "Orders Service",
          title: "x",
          description: "x",
          severity: "high",
          status: "awaiting_approval",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          scenarioId: "ORDERS_REDIS_FAILURE",
        },
        {
          id: "INC-001",
          service: "Orders Service",
          scenario: "ORDERS_REDIS_FAILURE",
          status: "open",
        },
      ),
      false,
    );
  });
});

describe("syncIncidentsFromSimulator", () => {
  test("creates current open incident and supersedes stale Payment awaiting_approval", async () => {
    const stale = await createIncident({
      service: "Payment Service",
      title: "Payment Service 500 Errors",
      description: "Payment Service failing",
      severity: "critical",
      source: "resilience_test",
      scenarioId: "PAYMENT_DEPLOYMENT_REGRESSION",
    });
    await updateIncident(stale.id, { status: "awaiting_approval" });

    mockSimulator.simulateScenario("ORDERS_REDIS_FAILURE");

    const synced = await syncIncidentsFromSimulator();

    assert.equal(synced.openSimulatorCount, 1);
    assert.equal(synced.activeIncidents.length, 1);
    assert.equal(synced.activeIncidents[0].service, "Orders Service");
    assert.equal(synced.activeIncidents[0].simulatorIncidentId, "INC-001");
    assert.ok(synced.created.some((item) => item.service === "Orders Service"));

    const staleAfter = synced.incidents.find((item) => item.id === stale.id);
    assert.equal(staleAfter?.status, "failed");
    assert.ok(
      staleAfter?.investigation?.notes?.some((note) =>
        note.includes("Superseded"),
      ),
    );
  });

  test("reuses the same OpsPilot incident when simulatorIncidentId matches", async () => {
    mockSimulator.simulateScenario("USERS_AUTH_DEPLOYMENT");
    const first = await syncIncidentsFromSimulator();
    assert.equal(first.activeIncidents.length, 1);
    const id = first.activeIncidents[0].id;

    const second = await syncIncidentsFromSimulator();
    assert.equal(second.created.length, 0);
    assert.equal(second.activeIncidents.length, 1);
    assert.equal(second.activeIncidents[0].id, id);
    assert.equal(second.activeIncidents[0].service, "Users Service");
  });
});
