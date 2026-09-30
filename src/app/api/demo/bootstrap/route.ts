import { ensureDemoIncident } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonOk } from "@/lib/api/http";

/**
 * Ensures a Payment Service demo incident exists for the hackathon flow.
 */
export async function POST() {
  try {
    const incident = ensureDemoIncident();
    return jsonOk({ incident });
  } catch (error) {
    return handleRouteError(error);
  }
}
