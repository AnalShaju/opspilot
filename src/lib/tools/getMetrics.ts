import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import { normalizeMetrics } from "@/lib/simulator/normalize";
import type { SimulatorMetrics } from "@/lib/types/simulator";

export async function getMetrics(): Promise<SimulatorMetrics> {
  const payload = isMockSimulatorEnabled()
    ? mockSimulator.getMetrics()
    : await simulatorGet<unknown>("/metrics");
  return normalizeMetrics(payload) as SimulatorMetrics;
}
