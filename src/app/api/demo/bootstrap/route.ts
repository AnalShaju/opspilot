import { ensureDemoIncident } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonOk } from "@/lib/api/http";

/**
 * Ensures the default demo incident exists for the hackathon overview flow.
 */
export async function POST() {
  try {
    const incident = await ensureDemoIncident();
    return jsonOk({ incident });
  } catch (error) {
    return handleRouteError(error);
  }
}
