import { getIncidentById } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const incident = await getIncidentById(id);

    if (!incident) {
      return jsonError(`Incident not found: ${id}`, 404);
    }

    return jsonOk({ incident });
  } catch (error) {
    return handleRouteError(error);
  }
}
