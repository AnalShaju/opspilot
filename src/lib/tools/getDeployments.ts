import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { unwrapList } from "@/lib/simulator/normalize";
import type { SimulatorDeployment } from "@/lib/types/simulator";

export async function getDeployments(): Promise<SimulatorDeployment[]> {
  if (isMockSimulatorEnabled()) return mockSimulator.getDeployments();
  const payload = await simulatorGet<unknown>("/deployments");
  return unwrapList<SimulatorDeployment>(payload, ["deployments"]);
}
