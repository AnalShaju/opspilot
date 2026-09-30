/**
 * Local mock responses used when USE_MOCK_SIMULATOR=true.
 * Mirrors the public contract of the separate production simulator
 * (scenarios, per-scenario remediation, /health recovery flag) so the whole
 * workflow can be exercised without it running.
 */

import type {
  SimulatorActionResult,
  SimulatorDeployment,
  SimulatorHealth,
  SimulatorLogEntry,
  SimulatorMetrics,
  SimulatorPreviousIncident,
  SimulatorScenarioResult,
  SimulatorService,
} from "@/lib/types/simulator";
import { SimulatorError } from "@/lib/types/simulator";

type ScenarioId =
  | "PAYMENT_DEPLOYMENT_REGRESSION"
  | "ORDERS_REDIS_FAILURE"
  | "USERS_AUTH_DEPLOYMENT"
  | "DATABASE_CONNECTION_EXHAUSTION";

const SCENARIOS: Record<
  ScenarioId,
  { service: string; title: string; severity: string }
> = {
  PAYMENT_DEPLOYMENT_REGRESSION: {
    service: "Payment Service",
    title: "Payment Service 500 Errors",
    severity: "critical",
  },
  ORDERS_REDIS_FAILURE: {
    service: "Orders Service",
    title: "Orders Service Redis Failover Impact",
    severity: "high",
  },
  USERS_AUTH_DEPLOYMENT: {
    service: "Users Service",
    title: "Users Authentication Failures",
    severity: "critical",
  },
  DATABASE_CONNECTION_EXHAUSTION: {
    service: "Database",
    title: "Database Connection Pool Exhaustion",
    severity: "critical",
  },
};

let activeScenario: ScenarioId | null = null;
let recoveryStatus: "none" | "verified" = "none";
/** Services whose active deployment was rolled back in mock mode. */
const rolledBack = new Set<string>();

export function resetMockSimulatorState() {
  activeScenario = null;
  recoveryStatus = "none";
  rolledBack.clear();
}

function isScenario(id: string): id is ScenarioId {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, id);
}

function badRequest(path: string, message: string): never {
  throw new SimulatorError(
    `Simulator request failed (400) for ${path}: ${message}`,
    502,
    { success: false, message },
  );
}

function serviceStates(): Record<string, string> {
  const states: Record<string, string> = {
    "API Gateway": "healthy",
    "Users Service": "healthy",
    "Orders Service": "healthy",
    "Payment Service": "healthy",
    Database: "healthy",
    Redis: "healthy",
  };
  switch (activeScenario) {
    case "PAYMENT_DEPLOYMENT_REGRESSION":
      states["Payment Service"] = "failing";
      break;
    case "ORDERS_REDIS_FAILURE":
      states["Orders Service"] = "degraded";
      states.Redis = "unhealthy";
      break;
    case "USERS_AUTH_DEPLOYMENT":
      states["Users Service"] = "failing";
      break;
    case "DATABASE_CONNECTION_EXHAUSTION":
      states["Orders Service"] = "degraded";
      states["Payment Service"] = "degraded";
      states.Database = "degraded";
      break;
  }
  return states;
}

function paymentMetrics() {
  if (activeScenario === "PAYMENT_DEPLOYMENT_REGRESSION") {
    return { errorRate: 82, successRate: 18, latency: 2400 };
  }
  if (activeScenario === "DATABASE_CONNECTION_EXHAUSTION") {
    return { errorRate: 28, successRate: 72, latency: 1800 };
  }
  return { errorRate: 1, successRate: 99, latency: 180 };
}

function metricsSnapshot() {
  const db = activeScenario === "DATABASE_CONNECTION_EXHAUSTION";
  const redisDown = activeScenario === "ORDERS_REDIS_FAILURE";
  return {
    payment: paymentMetrics(),
    orders: {
      errorRate: db ? 22 : redisDown ? 4 : 1,
      latency: db ? 2100 : redisDown ? 2800 : 180,
      status: db || redisDown ? "degraded" : "healthy",
    },
    users: {
      authErrorRate: activeScenario === "USERS_AUTH_DEPLOYMENT" ? 76 : 1,
      status: activeScenario === "USERS_AUTH_DEPLOYMENT" ? "failing" : "healthy",
    },
    database: {
      status: db ? "degraded" : "healthy",
      errorRate: db ? 35 : 1,
      latency: db ? 2400 : 120,
      connectionsUsed: db ? 100 : 22,
      connectionsMax: 100,
    },
    redis: { status: redisDown ? "unhealthy" : "healthy" },
  };
}

export const mockSimulator = {
  reset() {
    resetMockSimulatorState();
  },

  simulateScenario(scenarioId: string): SimulatorScenarioResult {
    if (!isScenario(scenarioId)) {
      badRequest(`/simulate/${scenarioId}`, `Unknown scenario '${scenarioId}'`);
    }
    activeScenario = scenarioId;
    recoveryStatus = "none";
    return {
      success: true,
      scenarioId,
      message: `Scenario ${scenarioId} simulated successfully`,
      incidentId: "INC-001",
    };
  },

  getLogs(): SimulatorLogEntry[] {
    const base: SimulatorLogEntry[] = [
      {
        timestamp: "14:28:01",
        level: "INFO",
        service: "Payment Service",
        message: "Payment request processed successfully",
      },
    ];
    switch (activeScenario) {
      case "PAYMENT_DEPLOYMENT_REGRESSION":
        return [
          ...base,
          {
            timestamp: "14:32:14",
            level: "ERROR",
            service: "Payment Service",
            message: "Payment gateway retry protocol rejected: HTTP 500",
          },
        ];
      case "ORDERS_REDIS_FAILURE":
        return [
          ...base,
          {
            timestamp: "14:32:14",
            level: "ERROR",
            service: "Orders Service",
            message: "Redis connection refused; session lookups timing out",
          },
        ];
      case "USERS_AUTH_DEPLOYMENT":
        return [
          ...base,
          {
            timestamp: "15:12:14",
            level: "ERROR",
            service: "Users Service",
            message: "Auth token validation failed after v2.3.0 rollout",
          },
        ];
      case "DATABASE_CONNECTION_EXHAUSTION":
        return [
          ...base,
          {
            timestamp: "14:32:14",
            level: "ERROR",
            service: "Database",
            message: "Connection pool exhausted: 100/100 connections in use",
          },
        ];
      default:
        return base;
    }
  },

  getMetrics(): SimulatorMetrics {
    return metricsSnapshot() as unknown as SimulatorMetrics;
  },

  getServices(): SimulatorService[] {
    return Object.entries(serviceStates()).map(([name, status]) => ({
      name,
      status,
    }));
  },

  getDeployments(): SimulatorDeployment[] {
    const paymentRolledBack = rolledBack.has("Payment Service");
    const usersRolledBack = rolledBack.has("Users Service");
    return [
      {
        version: "v1.8.4",
        service: "Payment Service",
        deployedAt: "14:30",
        status: paymentRolledBack ? "rolled_back" : "active",
      },
      {
        version: "v1.8.3",
        service: "Payment Service",
        deployedAt: "12:10",
        status: paymentRolledBack ? "active" : "previous",
      },
      {
        version: "v2.3.0",
        service: "Users Service",
        deployedAt: "15:10",
        status: usersRolledBack ? "rolled_back" : "active",
      },
      {
        version: "v2.2.1",
        service: "Users Service",
        deployedAt: "11:00",
        status: usersRolledBack ? "active" : "previous",
      },
      {
        version: "v3.0.1",
        service: "Orders Service",
        deployedAt: "10:00",
        status: "active",
      },
    ];
  },

  getPreviousIncidents(): SimulatorPreviousIncident[] {
    const list: SimulatorPreviousIncident[] = [
      {
        id: "INC-000",
        service: "Payment Service",
        cause: "Deployment v1.7.9",
        action: "Rollback",
        result: "Resolved",
        status: "resolved",
      },
    ];
    if (activeScenario) {
      const meta = SCENARIOS[activeScenario];
      list.push({
        id: "INC-001",
        scenario: activeScenario,
        service: meta.service,
        title: meta.title,
        severity: meta.severity,
        status: "open",
      });
    }
    return list;
  },

  rollbackDeployment(
    version: string,
    service?: string,
  ): SimulatorActionResult {
    const path = "/actions/rollback";
    if (
      activeScenario === "PAYMENT_DEPLOYMENT_REGRESSION" &&
      version === "v1.8.4" &&
      (!service || service === "Payment Service")
    ) {
      rolledBack.add("Payment Service");
      activeScenario = null;
      recoveryStatus = "verified";
      return {
        success: true,
        action: "rollback",
        version,
        message: `Deployment ${version} rolled back successfully`,
      };
    }
    if (
      activeScenario === "USERS_AUTH_DEPLOYMENT" &&
      version === "v2.3.0" &&
      service === "Users Service"
    ) {
      rolledBack.add("Users Service");
      activeScenario = null;
      recoveryStatus = "verified";
      return {
        success: true,
        action: "rollback",
        version,
        service,
        message: `Deployment ${version} rolled back successfully`,
      };
    }
    return badRequest(path, "Rollback is not applicable to the active scenario");
  },

  restartRedis(): SimulatorActionResult {
    if (activeScenario !== "ORDERS_REDIS_FAILURE") {
      badRequest(
        "/actions/restart-redis",
        "Redis restart is not applicable to the active scenario",
      );
    }
    activeScenario = null;
    recoveryStatus = "verified";
    return {
      success: true,
      action: "restart-redis",
      message: "Redis restarted and Orders Service recovered",
    };
  },

  recoverDatabase(): SimulatorActionResult {
    if (activeScenario !== "DATABASE_CONNECTION_EXHAUSTION") {
      badRequest(
        "/actions/recover-database",
        "Database recovery is not applicable to the active scenario",
      );
    }
    activeScenario = null;
    recoveryStatus = "verified";
    return {
      success: true,
      action: "recover-database",
      message: "Database connection pool recovered successfully",
    };
  },

  verifyHealth(): SimulatorHealth {
    const payment = paymentMetrics();
    const states = serviceStates();
    return {
      recovered: recoveryStatus === "verified" && activeScenario === null,
      recoveryStatus,
      activeScenario,
      services: states,
      paymentService: states["Payment Service"],
      errorRate: payment.errorRate,
      paymentSuccessRate: payment.successRate,
    };
  },
};