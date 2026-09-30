import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classifyIncidentType } from "@/lib/incidents/classify";
import { evaluateHealth } from "@/lib/tools/verifyHealth";

describe("evaluateHealth (deterministic verification)", () => {
  test("Redis incident still active: payment fields look healthy but it is NOT recovered", () => {
    // Real simulator payload shape during ORDERS_REDIS_FAILURE.
    assert.equal(
      evaluateHealth({
        recovered: false,
        recoveryStatus: "none",
        activeScenario: "ORDERS_REDIS_FAILURE",
        services: { "Orders Service": "degraded", Redis: "unhealthy" },
        paymentService: "healthy",
        errorRate: 1,
        paymentSuccessRate: 99,
      }),
      false,
    );
  });

  test("recovered payload is healthy", () => {
    assert.equal(
      evaluateHealth({
        recovered: true,
        recoveryStatus: "verified",
        activeScenario: null,
        services: { "Orders Service": "healthy", Redis: "healthy" },
        paymentService: "healthy",
        errorRate: 1,
      }),
      true,
    );
  });

  test("recovered=true is not trusted while a scenario is still active", () => {
    assert.equal(
      evaluateHealth({ recovered: true, activeScenario: "USERS_AUTH_DEPLOYMENT" }),
      false,
    );
  });

  test("falls back to service states when the simulator omits `recovered`", () => {
    assert.equal(
      evaluateHealth({ services: { A: "healthy", B: "degraded" } }),
      false,
    );
    assert.equal(
      evaluateHealth({ services: { A: "healthy", B: "healthy" } }),
      true,
    );
  });

  test("legacy payment-only simulators still work", () => {
    assert.equal(evaluateHealth({ paymentService: "healthy", errorRate: 1 }), true);
    assert.equal(evaluateHealth({ paymentService: "failing", errorRate: 82 }), false);
  });
});

describe("classifyIncidentType (signals only)", () => {
  const deployments = [
    { version: "v1.8.4", service: "Payment Service", status: "active" },
    { version: "v2.3.0", service: "Users Service", status: "active" },
  ];

  test("unhealthy Redis -> cache_failure", () => {
    assert.equal(
      classifyIncidentType({
        services: [
          { name: "Orders Service", status: "degraded" },
          { name: "Redis", status: "unhealthy" },
        ],
        deployments,
      }),
      "cache_failure",
    );
  });

  test("saturated DB pool -> database_failure even when other services degrade", () => {
    assert.equal(
      classifyIncidentType({
        services: [
          { name: "Payment Service", status: "degraded" },
          { name: "Database", status: "degraded" },
        ],
        deployments,
        metrics: { database: { connectionsUsed: 100, connectionsMax: 100 } },
      }),
      "database_failure",
    );
  });

  test("failing service with an active deployment -> deployment_regression", () => {
    assert.equal(
      classifyIncidentType({
        services: [{ name: "Users Service", status: "failing" }],
        deployments,
      }),
      "deployment_regression",
    );
  });

  test("all healthy -> unknown", () => {
    assert.equal(
      classifyIncidentType({
        services: [{ name: "Users Service", status: "healthy" }],
        deployments,
      }),
      "unknown",
    );
  });
});
