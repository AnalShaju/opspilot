import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { incidentHistoryService } from "@/lib/services/incident-history.service";
import {
  ACTION_TYPES,
  INCIDENT_TYPES,
  type ActionType,
  type IncidentType,
} from "@/lib/types/incident";

/**
 * GET /api/incidents/history
 * Verified past recoveries (the "learning" material), newest first.
 * Optional filters: ?service=&incidentType=&actionType=&limit=
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const incidentType = searchParams.get("incidentType") ?? undefined;
    if (
      incidentType &&
      !(INCIDENT_TYPES as readonly string[]).includes(incidentType)
    ) {
      return jsonError(
        `Invalid incidentType. Use one of: ${INCIDENT_TYPES.join(", ")}`,
        400,
      );
    }

    const actionType = searchParams.get("actionType") ?? undefined;
    if (actionType && !(ACTION_TYPES as readonly string[]).includes(actionType)) {
      return jsonError(
        `Invalid actionType. Use one of: ${ACTION_TYPES.join(", ")}`,
        400,
      );
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      return jsonError("limit must be a positive integer", 400);
    }

    const records = await incidentHistoryService.listResolved({
      service: searchParams.get("service") ?? undefined,
      incidentType: incidentType as IncidentType | undefined,
      actionType: actionType as ActionType | undefined,
      limit,
    });

    return jsonOk({ records });
  } catch (error) {
    return handleRouteError(error);
  }
}
