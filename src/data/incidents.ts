import type { Incident } from "./types";

export const incidents: Incident[] = [
  {
    id: "1",
    code: "INC-001",
    title: "Payment Service Incident",
    service: "Payment Service",
    serviceId: "payment",
    summary: "500 errors detected across payment requests.",
    severity: "critical",
    status: "awaiting_approval",
    startedAt: "2026-09-30T14:32:00",
    startedLabel: "14:32",
    durationLabel: "8m",
    relativeTime: "8m ago",
    errorRate: 82,
    investigationSummary:
      "Payment failures increased from 2% to 82% shortly after deployment v1.8.4. Database health and payment provider status remain normal.",
    investigationSteps: [
      {
        id: "s1",
        label: "Incident detected",
        timestamp: "14:32:04",
        completed: true,
      },
      {
        id: "s2",
        label: "Checking application logs",
        timestamp: "14:32:18",
        completed: true,
      },
      {
        id: "s3",
        label: "Checking service health",
        timestamp: "14:32:31",
        completed: true,
      },
      {
        id: "s4",
        label: "Checking recent deployments",
        timestamp: "14:32:44",
        completed: true,
      },
      {
        id: "s5",
        label: "Checking metrics",
        timestamp: "14:32:58",
        completed: true,
      },
      {
        id: "s6",
        label: "Checking previous incidents",
        timestamp: "14:33:12",
        completed: true,
      },
      {
        id: "s7",
        label: "Comparing evidence",
        timestamp: "14:33:27",
        completed: true,
      },
    ],
    evidence: [
      {
        id: "e1",
        type: "logs",
        title: "Application Logs",
        summary: "Payment DB connection timeout",
        details: [
          "14:32:14 ERROR payment-api: connection timeout after 5000ms",
          "14:32:16 ERROR payment-api: failed to acquire pool connection",
          "14:32:21 WARN  payment-api: retry exhausted for charge_id=ch_9f2a",
        ],
        timestamp: "14:32:14",
      },
      {
        id: "e2",
        type: "metrics",
        title: "Metrics",
        summary: "Error rate 2% → 82%",
        details: [
          "p99 latency: 180ms → 4.2s",
          "Request volume: stable at ~1.2k rpm",
          "CPU / memory: within normal bounds",
        ],
        timestamp: "14:33:00",
      },
      {
        id: "e3",
        type: "deployment",
        title: "Recent Deployment",
        summary: "v1.8.4 · Payment Service · 14:30",
        details: [
          "Author: jordan.lee",
          "Commit: a3f91c2 — refactor connection pool defaults",
          "Deploy pipeline: prod-payments #482",
        ],
        timestamp: "14:30",
      },
      {
        id: "e4",
        type: "service_health",
        title: "Service Health",
        summary: "Payment Service unhealthy; dependencies healthy",
        details: [
          "Payment Service: Unhealthy",
          "Database: Healthy",
          "Payment Provider: Healthy",
        ],
        timestamp: "14:33:05",
      },
      {
        id: "e5",
        type: "previous_incident",
        title: "Previous Incidents",
        summary:
          "Similar payment failures were resolved by rolling back a deployment.",
        details: [
          "INC-087 (Mar 12): pool misconfig after deploy — rolled back in 3m",
          "Pattern match confidence: 88%",
        ],
        timestamp: "14:33:12",
      },
    ],
    rootCause: {
      title: "Likely Root Cause",
      target: "Deployment v1.8.4",
      confidence: 92,
      explanation:
        "Payment errors began approximately two minutes after deployment v1.8.4 while dependent services remained healthy.",
    },
    recommendedAction: {
      title: "Recommended Action",
      action: "Rollback deployment v1.8.4",
      risk: "medium",
      reason:
        "Rolling back the latest payment deployment is expected to restore the previous stable version.",
      requiresApproval: true,
    },
    recovery: {
      errorRateBefore: 82,
      errorRateAfter: 1,
      paymentSuccessBefore: 18,
      paymentSuccessAfter: 99,
      serviceHealthAfter: "healthy",
      recoveryTime: "2m 14s",
    },
    reportId: "rpt-001",
  },
  {
    id: "2",
    code: "INC-002",
    title: "Orders Service Latency",
    service: "Orders Service",
    serviceId: "orders",
    summary: "Elevated p99 latency on checkout and order create paths.",
    severity: "high",
    status: "resolved",
    startedAt: "2026-09-30T12:05:00",
    startedLabel: "12:05",
    durationLabel: "22m",
    relativeTime: "2h ago",
    errorRate: 0.4,
    investigationSummary:
      "Latency spike correlated with a cold cache after a Redis failover. Traffic normalized after cache warm-up completed.",
    investigationSteps: [
      {
        id: "s1",
        label: "Incident detected",
        timestamp: "12:05:08",
        completed: true,
      },
      {
        id: "s2",
        label: "Checking application logs",
        timestamp: "12:05:22",
        completed: true,
      },
      {
        id: "s3",
        label: "Checking service health",
        timestamp: "12:05:40",
        completed: true,
      },
      {
        id: "s4",
        label: "Checking recent deployments",
        timestamp: "12:05:55",
        completed: true,
      },
      {
        id: "s5",
        label: "Checking metrics",
        timestamp: "12:06:10",
        completed: true,
      },
      {
        id: "s6",
        label: "Checking previous incidents",
        timestamp: "12:06:28",
        completed: true,
      },
      {
        id: "s7",
        label: "Comparing evidence",
        timestamp: "12:06:44",
        completed: true,
      },
    ],
    evidence: [
      {
        id: "e1",
        type: "logs",
        title: "Application Logs",
        summary: "Cache miss rate elevated after Redis node swap",
        details: [
          "12:05:11 WARN orders-api: redis primary failover detected",
          "12:05:18 INFO orders-api: rebuilding local cache",
        ],
        timestamp: "12:05:11",
      },
      {
        id: "e2",
        type: "metrics",
        title: "Metrics",
        summary: "p99 latency 210ms → 1.8s",
        details: ["Error rate remained below 1%", "Cache hit ratio: 94% → 41%"],
        timestamp: "12:06:00",
      },
      {
        id: "e3",
        type: "deployment",
        title: "Recent Deployment",
        summary: "No deploy within the incident window",
        details: ["Last orders deploy: v1.8.3 at 12:10 (post-incident)"],
      },
      {
        id: "e4",
        type: "service_health",
        title: "Service Health",
        summary: "Orders Service degraded during failover",
        details: [
          "Orders Service: Degraded",
          "Redis: Recovering",
          "API Gateway: Healthy",
        ],
      },
      {
        id: "e5",
        type: "previous_incident",
        title: "Previous Incidents",
        summary: "Prior Redis failovers showed the same warm-up pattern.",
        details: ["INC-061 resolved after 18m of passive warm-up"],
      },
    ],
    rootCause: {
      title: "Likely Root Cause",
      target: "Redis failover warm-up",
      confidence: 86,
      explanation:
        "Latency rose immediately after a Redis primary failover while application error rates stayed low.",
    },
    recommendedAction: {
      title: "Recommended Action",
      action: "Allow cache warm-up; monitor p99",
      risk: "low",
      reason:
        "No rollback required. Warm-up completed and latency returned to baseline.",
      requiresApproval: false,
    },
    recovery: {
      errorRateBefore: 0.4,
      errorRateAfter: 0.1,
      paymentSuccessBefore: 99,
      paymentSuccessAfter: 99,
      serviceHealthAfter: "healthy",
      recoveryTime: "22m",
    },
    reportId: "rpt-002",
  },
];

export function getIncidentById(id: string): Incident | undefined {
  return incidents.find((incident) => incident.id === id);
}

export function getActiveIncidents(): Incident[] {
  return incidents.filter((incident) => incident.status !== "resolved");
}
