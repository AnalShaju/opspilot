import {
  pickPrimaryActiveIncident,
  syncIncidentsFromSimulator,
} from "@/lib/incidents/incidentService";
import { handleRouteError, jsonOk } from "@/lib/api/http";

/**
 * Sync open incidents from the simulator into OpsPilot.
 * Does not invent a Payment demo — only materializes what the simulator reports.
 *
 * Response:
 * - incidents: full OpsPilot list after sync
 * - activeIncidents: OpsPilot records linked to currently-open simulator incidents
 * - created: newly created from open simulator incidents
 * - incident: most recent of activeIncidents (any service), or null
 */
export async function POST() {
  try {
    const synced = await syncIncidentsFromSimulator();
    return jsonOk({
      incidents: synced.incidents,
      activeIncidents: synced.activeIncidents,
      created: synced.created,
      superseded: synced.superseded,
      openSimulatorCount: synced.openSimulatorCount,
      incident: pickPrimaryActiveIncident(synced.activeIncidents),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
