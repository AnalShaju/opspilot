/**
 * Coarse incident classification from RAW signals only.
 *
 * This is detection, not diagnosis: it looks at which component is unhealthy
 * so history can be matched ("same kind of failure"). It knows nothing about
 * simulator scenario names, and DeepSeek still decides the actual root cause
 * (and may return its own incidentType, which takes precedence).
 */

import type { IncidentType } from "@/lib/types/incident";

interface ServiceLike {
  name?: unknown;
  status?: unknown;
}

interface DeploymentLike {
  service?: unknown;
  status?: unknown;
}

function isUnhealthy(status: unknown): boolean {
  return typeof status === "string" && status.toLowerCase() !== "healthy";
}

function isActiveDeployment(status: unknown): boolean {
  const value = String(status ?? "").toLowerCase();
  return value === "active" || value === "deployed";
}

function nameIncludes(service: ServiceLike, needle: string): boolean {
  return String(service.name ?? "")
    .toLowerCase()
    .includes(needle);
}

export function classifyIncidentType(evidence: {
  services?: unknown;
  deployments?: unknown;
  metrics?: unknown;
}): IncidentType {
  const services = (Array.isArray(evidence.services)
    ? evidence.services
    : []) as ServiceLike[];
  const deployments = (Array.isArray(evidence.deployments)
    ? evidence.deployments
    : []) as DeploymentLike[];

  const unhealthy = services.filter((service) => isUnhealthy(service.status));

  if (unhealthy.some((service) => nameIncludes(service, "redis"))) {
    return "cache_failure";
  }

  const metrics = (evidence.metrics ?? {}) as {
    database?: { connectionsUsed?: unknown; connectionsMax?: unknown };
  };
  const used = metrics.database?.connectionsUsed;
  const max = metrics.database?.connectionsMax;
  const poolSaturated =
    typeof used === "number" && typeof max === "number" && max > 0
      ? used / max >= 0.95
      : false;

  if (
    unhealthy.some((service) => nameIncludes(service, "database")) ||
    poolSaturated
  ) {
    return "database_failure";
  }

  const unhealthyWithActiveDeploy = unhealthy.some((service) =>
    deployments.some(
      (deployment) =>
        isActiveDeployment(deployment.status) &&
        String(deployment.service ?? "").toLowerCase() ===
          String(service.name ?? "").toLowerCase(),
    ),
  );
  if (unhealthyWithActiveDeploy) return "deployment_regression";

  return "unknown";
}
