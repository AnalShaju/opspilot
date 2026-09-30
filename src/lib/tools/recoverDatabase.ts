import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import type { SimulatorActionResult } from "@/lib/types/simulator";

/** Controlled remediation: recover the database connection pool. */
export async function recoverDatabase(): Promise<SimulatorActionResult> {
  if (isMockSimulatorEnabled()) return mockSimulator.recoverDatabase();
  return simulatorPost<SimulatorActionResult>("/actions/recover-database");
}
