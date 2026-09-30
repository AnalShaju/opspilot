import { simulatorPost, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import type { SimulatorScenarioResult } from "@/lib/types/simulator";

/**
 * Public simulator scenario APIs (used by the demo bootstrap and the
 * Resilience Tester). These only call documented endpoints:
 *   POST /reset
 *   POST /simulate/:scenarioId
 */

export async function resetSimulator(): Promise<void> {
  if (isMockSimulatorEnabled()) {
    mockSimulator.reset();
    return;
  }
  await simulatorPost("/reset");
}

export async function simulateScenario(
  scenarioId: string,
): Promise<SimulatorScenarioResult> {
  if (isMockSimulatorEnabled()) return mockSimulator.simulateScenario(scenarioId);
  return simulatorPost<SimulatorScenarioResult>(
    `/simulate/${encodeURIComponent(scenarioId)}`,
  );
}
