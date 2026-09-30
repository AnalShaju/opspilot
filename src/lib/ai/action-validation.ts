/**
 * Safety gate between an AI recommendation and the simulator.
 *
 *   AI -> recommendation -> human approval -> THIS VALIDATION -> simulator
 *
 * Runs when the AI response is parsed AND again right before execution
 * (against fresh deployment data), so a stale or invented action can never
 * be executed.
 */

import {
  ACTION_TYPES,
  type ActionRisk,
  type ActionType,
} from "@/lib/types/incident";
import { AgentError } from "@/lib/types/agent";

export interface DeploymentEvidence {
  version: string;
  service?: string;
  status?: string;
}

export interface ValidatedAction {
  type: ActionType;
  target: string;
  service?: string;
}

export const RISK_LEVELS: readonly ActionRisk[] = ["low", "medium", "high"];

function isActive(status?: string): boolean {
  return status === "active" || status === "deployed";
}

export function parseDeployments(evidence: unknown): DeploymentEvidence[] {
  if (!Array.isArray(evidence)) return [];
  const rows: DeploymentEvidence[] = [];
  for (const item of evidence) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.version !== "string" || !record.version.trim()) continue;
    rows.push({
      version: record.version.trim(),
      service:
        typeof record.service === "string" ? record.service.trim() : undefined,
      status:
        typeof record.status === "string"
          ? record.status.toLowerCase()
          : undefined,
    });
  }
  return rows;
}

/**
 * Rollback targets the ACTIVE (bad) deployment of a service. Models sometimes
 * name the previous healthy version instead; that is mapped to the active one
 * for the same service. Versions that are not in the evidence are rejected.
 */
export function resolveRollbackTarget(
  request: { target: string; service?: string },
  deployments: DeploymentEvidence[],
  fallbackService?: string,
): { target: string; service: string } {
  const version = request.target.trim();
  const requestedService = request.service?.trim() || undefined;

  const matched = deployments.find(
    (deployment) =>
      deployment.version === version &&
      (!requestedService || deployment.service === requestedService),
  );

  if (!matched) {
    throw new AgentError(
      `Rollback target ${version} was not found in deployment evidence`,
      "INVALID_ACTION",
    );
  }

  const service = matched.service ?? requestedService ?? fallbackService;
  if (!service) {
    throw new AgentError(
      `Cannot determine which service ${version} belongs to`,
      "INVALID_ACTION",
    );
  }

  const active = deployments.find(
    (deployment) => deployment.service === service && isActive(deployment.status),
  );
  if (!active) {
    throw new AgentError(
      `No active deployment found for ${service}; nothing to roll back`,
      "INVALID_ACTION",
    );
  }

  return { target: active.version, service };
}

/**
 * Validates + normalizes an action. Throws AgentError("INVALID_ACTION") for
 * anything unsupported.
 */
export function validateAction(
  request: { type?: unknown; target?: unknown; service?: unknown },
  context: { deployments: DeploymentEvidence[]; incidentService?: string },
): ValidatedAction {
  const type = request.type;
  if (
    typeof type !== "string" ||
    !(ACTION_TYPES as readonly string[]).includes(type)
  ) {
    throw new AgentError(
      `Unsupported action type: ${String(type)}. Allowed: ${ACTION_TYPES.join(", ")}`,
      "INVALID_ACTION",
    );
  }

  switch (type as ActionType) {
    case "rollback": {
      if (typeof request.target !== "string" || !request.target.trim()) {
        throw new AgentError(
          "Invalid recommendedAction.target",
          "INVALID_ACTION",
        );
      }
      const resolved = resolveRollbackTarget(
        {
          target: request.target,
          service:
            typeof request.service === "string" ? request.service : undefined,
        },
        context.deployments,
        context.incidentService,
      );
      return { type: "rollback", ...resolved };
    }
    case "restart_redis":
      return { type: "restart_redis", target: "Redis" };
    case "recover_database":
      return { type: "recover_database", target: "Database" };
  }
}
