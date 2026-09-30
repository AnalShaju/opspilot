import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { unwrapList } from "@/lib/simulator/normalize";
import type { SimulatorPreviousIncident } from "@/lib/types/simulator";

export async function getPreviousIncidents(): Promise<
  SimulatorPreviousIncident[]
> {
  if (isMockSimulatorEnabled()) return mockSimulator.getPreviousIncidents();
  const payload = await simulatorGet<unknown>("/incidents");
  return unwrapList<SimulatorPreviousIncident>(payload, ["incidents"]);
}
