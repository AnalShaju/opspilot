import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { isAlreadyHealthyRemediationError } from "@/lib/simulator/normalize";
import type { SimulatorActionResult } from "@/lib/types/simulator";
import { SimulatorError } from "@/lib/types/simulator";

/** Controlled remediation: recover the database connection pool. */
export async function recoverDatabase(): Promise<SimulatorActionResult> {
  if (isMockSimulatorEnabled()) return mockSimulator.recoverDatabase();

  try {
    return await simulatorPost<SimulatorActionResult>(
      "/actions/recover-database",
    );
  } catch (error) {
    if (
      error instanceof SimulatorError &&
      isAlreadyHealthyRemediationError(error.details)
    ) {
      return {
        success: true,
        message: "Database is already healthy; recover not required",
      };
    }
    throw error;
  }
}
