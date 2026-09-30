import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { isAlreadyRolledBackError } from "@/lib/simulator/normalize";
import type { SimulatorActionResult } from "@/lib/types/simulator";
import { SimulatorError } from "@/lib/types/simulator";

/**
 * Controlled remediation action.
 * The AI may recommend this, but only backend code (after human approval)
 * ever calls it.
 */
export async function rollbackDeployment(
  version: string,
  service?: string,
): Promise<SimulatorActionResult> {
  if (!version || typeof version !== "string") {
    throw new Error("rollbackDeployment requires a version string");
  }

  if (isMockSimulatorEnabled()) {
    return mockSimulator.rollbackDeployment(version, service);
  }

  try {
    return await simulatorPost<SimulatorActionResult>("/actions/rollback", {
      version,
      ...(service ? { service } : {}),
    });
  } catch (error) {
    // Simulator returns 400 when the version is already rolled back — treat as
    // idempotent success so approve→verify still completes.
    if (
      error instanceof SimulatorError &&
      isAlreadyRolledBackError(error.details)
    ) {
      return {
        success: true,
        version,
        message: `Deployment ${version} already rolled back`,
        alreadyRolledBack: true,
      };
    }
    throw error;
  }
}
