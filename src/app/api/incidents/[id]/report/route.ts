import { getIncidentReport } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonOk } from "@/lib/api/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const report = getIncidentReport(id);
    return jsonOk({ report });
  } catch (error) {
    return handleRouteError(error);
  }
}
