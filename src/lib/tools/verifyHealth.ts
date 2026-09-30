import { simulatorGet, isMockSimulatorEnabled } from "@/lib/simulator/client";
import { mockSimulator } from "@/lib/simulator/mock";
import type { SimulatorHealth } from "@/lib/types/simulator";

export async function verifyHealth(): Promise<SimulatorHealth> {
  if (isMockSimulatorEnabled()) return mockSimulator.verifyHealth();
  return simulatorGet<SimulatorHealth>("/health");
}

/**
 * Decides whether production is healthy again. Deterministic, no AI.
 *
 * Priority:
 * 1. Simulator `recovered` + `activeScenario` (authoritative when present)
 * 2. Named affected service health (from the incident being verified)
 * 3. All reported service states
 * 4. Generic status / errorRate fallback (never assumes Payment)
 */
export function evaluateHealth(
  health: SimulatorHealth,
  affectedService?: string,
): boolean {
  if (typeof health.recovered === "boolean") {
    if (!health.recovered) return false;
    if (health.activeScenario) return false;
  } else if (health.activeScenario) {
    return false;
  }

  const services = health.services ?? {};
  if (affectedService) {
    const matched = Object.entries(services).find(
      ([name]) => name.toLowerCase() === affectedService.toLowerCase(),
    );
    if (matched) {
      return String(matched[1]).toLowerCase() === "healthy";
    }
  }

  const serviceStates = Object.values(services).map((value) =>
    String(value).toLowerCase(),
  );
  if (serviceStates.length > 0) {
    return serviceStates.every((state) => state === "healthy");
  }

  if (typeof health.recovered === "boolean") return health.recovered;

  return (
    String(health.status ?? "").toLowerCase() === "healthy" ||
    (typeof health.errorRate === "number" && health.errorRate < 5)
  );
}
