import { handleRouteError, jsonOk } from "@/lib/api/http";
import { evaluateHealth, verifyHealth } from "@/lib/tools";
import { isMockSimulatorEnabled } from "@/lib/simulator/client";

/** Live simulator health + connectivity hint for debugging deploys. */
export async function GET() {
  try {
    const mock = isMockSimulatorEnabled();
    if (mock) {
      return jsonOk({
        healthy: true,
        activeScenario: null,
        recovered: true,
        mock: true,
        message: "USE_MOCK_SIMULATOR=true — not calling a live simulator",
      });
    }

    const health = await verifyHealth();
    return jsonOk({
      health,
      healthy: evaluateHealth(health),
      activeScenario: health.activeScenario ?? null,
      recovered: health.recovered ?? null,
      mock: false,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
