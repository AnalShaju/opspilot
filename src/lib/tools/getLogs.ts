import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { unwrapList } from "@/lib/simulator/normalize";
import type { SimulatorLogEntry } from "@/lib/types/simulator";

export async function getLogs(): Promise<SimulatorLogEntry[]> {
  if (isMockSimulatorEnabled()) return mockSimulator.getLogs();
  const payload = await simulatorGet<unknown>("/logs");
  return unwrapList<SimulatorLogEntry>(payload, ["logs"]);
}
