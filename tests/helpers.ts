import type { CollectedEvidence } from "@/lib/evidence/collector";
import type { NewIncidentHistoryRecord } from "@/lib/types/history";
import type { Incident } from "@/lib/types/incident";

export function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "INC-100",
    code: "INC-100",
    service: "Orders Service",
    title: "Orders Service Redis Failover Impact",
    description: "Orders Service degraded, Redis unhealthy",
    severity: "high",
    status: "resolved",
    incidentType: "cache_failure",
    createdAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    rootCause: {
      summary: "Redis failover left the cache unreachable",
      confidence: 0.9,
      evidence: ["Redis status unhealthy", "Orders latency 2800ms"],
    },
    recommendedAction: {
      type: "restart_redis",
      target: "Redis",
      risk: "low",
      reason: "Restart Redis to restore the cache",
    },
    approval: {
      approved: true,
      approvedAt: "2026-09-30T10:00:30.000Z",
      approvedBy: "human",
    },
    recovery: {
      action: "restart_redis",
      target: "Redis",
      executed: true,
      executedAt: "2026-09-30T10:00:31.000Z",
      result: "Redis restarted and Orders Service recovered",
      verified: true,
      verifiedAt: "2026-09-30T10:00:42.000Z",
    },
    ...overrides,
  };
}

export function makeHistoryInput(
  overrides: Partial<NewIncidentHistoryRecord> = {},
): NewIncidentHistoryRecord {
  return {
    incidentId: "INC-050",
    incidentType: "cache_failure",
    service: "Orders Service",
    rootCause: "Redis was unreachable after failover",
    confidence: 0.88,
    evidenceSummary: ["Redis unhealthy"],
    recommendedAction: "restart_redis Redis — restart the cache",
    actionType: "restart_redis",
    actionTarget: "Redis",
    actionResult: "Redis restarted",
    verificationResult: "Orders Service recovered; health verification passed",
    outcome: "resolved",
    resolvedAt: "2026-09-29T10:00:00.000Z",
    recoveryDurationMs: 42_000,
    ...overrides,
  };
}

/** Evidence for a Redis failure, shaped like the simulator's real output. */
export function makeRedisEvidence(): CollectedEvidence {
  return {
    services: [
      { name: "Orders Service", status: "degraded" },
      { name: "Payment Service", status: "healthy" },
      { name: "Redis", status: "unhealthy" },
    ],
    logs: [
      {
        timestamp: "14:32:14",
        level: "ERROR",
        service: "Orders Service",
        message: "Redis connection refused; session lookups timing out",
      },
    ],
    metrics: { orders: { errorRate: 4, latency: 2800 } },
    deployments: [
      {
        version: "v1.8.4",
        service: "Payment Service",
        status: "active",
      },
      {
        version: "v1.8.3",
        service: "Payment Service",
        status: "previous",
      },
      {
        version: "v2.3.0",
        service: "Users Service",
        status: "active",
      },
      {
        version: "v2.2.1",
        service: "Users Service",
        status: "previous",
      },
    ],
    health: { recovered: false, activeScenario: "ORDERS_REDIS_FAILURE" },
    simulatorIncidents: [],
  };
}

export const REDIS_DIAGNOSIS = {
  investigationSummary: "Redis is unhealthy and Orders is degraded.",
  incidentType: "cache_failure",
  rootCause: {
    summary: "Redis is down, degrading Orders Service",
    confidence: 0.91,
    evidence: ["Redis status unhealthy", "Orders latency 2800ms"],
  },
  recommendedAction: {
    type: "restart_redis",
    target: "Redis",
    risk: "low",
    reason: "Restart Redis to restore the session cache",
  },
};
