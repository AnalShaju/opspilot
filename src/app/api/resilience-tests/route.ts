import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { resilienceTestService } from "@/lib/services/resilience-test.service";

/** GET /api/resilience-tests — available scenarios + recent tests. */
export async function GET() {
  try {
    return jsonOk({
      scenarios: resilienceTestService.listScenarios(),
      tests: await resilienceTestService.listTests(20),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/resilience-tests  { "scenarioId": "..." }
 * Creates AND starts a test: triggers the simulator scenario, detects the
 * incident, and hands it to the normal investigation workflow.
 * The returned test may already be "failed" (e.g. simulator unavailable);
 * see `failureReason`.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scenarioId?: unknown;
    };

    if (typeof body.scenarioId !== "string" || !body.scenarioId) {
      return jsonError('Body must include { "scenarioId": string }', 400);
    }

    const test = await resilienceTestService.startTest(body.scenarioId);
    return jsonOk({ test }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
