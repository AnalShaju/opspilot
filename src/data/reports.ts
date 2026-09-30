import type { IncidentReport } from "./types";

export const reports: IncidentReport[] = [
  {
    id: "rpt-001",
    incidentCode: "INC-001",
    incidentId: "1",
    title: "Payment Service Failure",
    service: "Payment Service",
    rootCause: "Deployment v1.8.4",
    status: "resolved",
    recoveryTime: "2m 14s",
    generatedAt: "2026-09-30T14:36:00",
    evidence: [
      "Error spike started after deployment",
      "Database remained healthy",
      "Payment provider remained healthy",
      "Similar previous incident was deployment-related",
    ],
    action: "Rolled back v1.8.4",
    result: "Payment service recovered",
    summary:
      "Critical payment 500 errors began two minutes after v1.8.4. OpsPilot correlated logs, metrics, and deploy history, recommended rollback, and verified recovery after human approval.",
  },
  {
    id: "rpt-002",
    incidentCode: "INC-002",
    incidentId: "2",
    title: "Orders Service High Latency",
    service: "Orders Service",
    rootCause: "Redis failover warm-up",
    status: "resolved",
    recoveryTime: "22m",
    generatedAt: "2026-09-30T12:27:00",
    evidence: [
      "Redis primary failover detected",
      "Cache hit ratio dropped from 94% to 41%",
      "No application deploy in the incident window",
      "Error rate remained below 1%",
    ],
    action: "Monitored cache warm-up; no rollback",
    result: "p99 latency returned to baseline",
    summary:
      "Orders latency rose after a Redis failover. OpsPilot ruled out deploy regressions and confirmed recovery after cache warm-up.",
  },
];

export function getReportById(id: string): IncidentReport | undefined {
  return reports.find((report) => report.id === id);
}

export function getReportByIncidentId(
  incidentId: string,
): IncidentReport | undefined {
  return reports.find((report) => report.incidentId === incidentId);
}
