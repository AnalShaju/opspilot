import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { isAlreadyHealthyRemediationError } from "@/lib/simulator/normalize";
import type { SimulatorActionResult } from "@/lib/types/simulator";
import { SimulatorError } from "@/lib/types/simulator";

/** Controlled remediation: restart Redis (cache / session store). */
export async function restartRedis(): Promise<SimulatorActionResult> {
  if (isMockSimulatorEnabled()) return mockSimulator.restartRedis();

  try {
    return await simulatorPost<SimulatorActionResult>("/actions/restart-redis");
  } catch (error) {
    // Already healthy → treat as success so approve → verify can finish.
    if (
      error instanceof SimulatorError &&
      isAlreadyHealthyRemediationError(error.details)
    ) {
      return {
        success: true,
        message: "Redis is already healthy; restart not required",
      };
    }
    throw error;
  }
}
