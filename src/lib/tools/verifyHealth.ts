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
 * The simulator's own `recovered` flag is authoritative. The legacy
 * payment-only heuristic is used ONLY for simulators that do not report it,
 * because for non-payment incidents (Redis, Users, Database) the payment
 * fields look healthy even while the incident is still active.
 */
export function evaluateHealth(health: SimulatorHealth): boolean {
  if (typeof health.recovered === "boolean") {
    if (!health.recovered) return false;
    if (health.activeScenario) return false;
    return true;
  }

  if (health.activeScenario) return false;

  const serviceStates = health.services
    ? Object.values(health.services).map((value) => String(value).toLowerCase())
    : [];
  if (serviceStates.length > 0) {
    return serviceStates.every((state) => state === "healthy");
  }

  return (
    String(health.paymentService ?? "").toLowerCase() === "healthy" ||
    String(health.status ?? "").toLowerCase() === "healthy" ||
    (typeof health.errorRate === "number" && health.errorRate < 5)
  );
}
