import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { unwrapList } from "@/lib/simulator/normalize";
import type { SimulatorService } from "@/lib/types/simulator";

export async function getServices(): Promise<SimulatorService[]> {
  if (isMockSimulatorEnabled()) return mockSimulator.getServices();
  const payload = await simulatorGet<unknown>("/services");
  return unwrapList<SimulatorService>(payload, ["services"]);
}
