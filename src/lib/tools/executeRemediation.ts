import { recoverDatabase } from "@/lib/tools/recoverDatabase";
import { restartRedis } from "@/lib/tools/restartRedis";
import { rollbackDeployment } from "@/lib/tools/rollbackDeployment";
import { ACTION_TYPES, type ActionType } from "@/lib/types/incident";
import type { SimulatorActionResult } from "@/lib/types/simulator";

export function isAllowedAction(type: string): type is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(type);
}

/**
 * Deterministic remediation dispatcher. NO AI is involved here.
 *
 * This is the only place that maps an approved action to a simulator call.
 * Unsupported actions are rejected before anything is sent.
 */
export async function executeRemediation(action: {
  type: string;
  target: string;
  service?: string;
}): Promise<SimulatorActionResult> {
  if (!isAllowedAction(action.type)) {
    throw new Error(`Action type not allowed: ${action.type}`);
  }

  switch (action.type) {
    case "rollback":
      return rollbackDeployment(action.target, action.service);
    case "restart_redis":
      return restartRedis();
    case "recover_database":
      return recoverDatabase();
  }
}
