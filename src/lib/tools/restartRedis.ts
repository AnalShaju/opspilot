import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import type { SimulatorActionResult } from "@/lib/types/simulator";

/** Controlled remediation: restart Redis (cache / session store). */
export async function restartRedis(): Promise<SimulatorActionResult> {
  if (isMockSimulatorEnabled()) return mockSimulator.restartRedis();
  return simulatorPost<SimulatorActionResult>("/actions/restart-redis");
}
