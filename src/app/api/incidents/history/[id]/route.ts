import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { incidentHistoryService } from "@/lib/services/incident-history.service";

/**
 * GET /api/incidents/history/:id
 * :id may be a history record id (HIST-001) or the source incident id.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const record = await incidentHistoryService.getById(id);
    if (!record) {
      return jsonError(`History record not found: ${id}`, 404);
    }
    return jsonOk({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}
