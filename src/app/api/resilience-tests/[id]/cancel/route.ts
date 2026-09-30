import { handleRouteError, jsonOk } from "@/lib/api/http";
import { resilienceTestService } from "@/lib/services/resilience-test.service";

/** POST /api/resilience-tests/:id/cancel — stop waiting; frees the simulator. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonOk({ test: await resilienceTestService.cancelTest(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
