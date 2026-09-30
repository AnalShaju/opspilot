import { handleRouteError, jsonOk } from "@/lib/api/http";
import { evaluateHealth, verifyHealth } from "@/lib/tools";

/** Live simulator health for post-remediation UI checks. */
export async function GET() {
  try {
    const health = await verifyHealth();
    return jsonOk({
      health,
      healthy: evaluateHealth(health),
      activeScenario: health.activeScenario ?? null,
      recovered: health.recovered ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
