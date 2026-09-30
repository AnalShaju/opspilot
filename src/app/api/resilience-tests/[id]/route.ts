import { handleRouteError, jsonOk } from "@/lib/api/http";
import { resilienceTestService } from "@/lib/services/resilience-test.service";

/** GET /api/resilience-tests/:id — current state, derived from real execution. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonOk({ test: await resilienceTestService.getTest(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
