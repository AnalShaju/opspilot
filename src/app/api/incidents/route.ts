import {
  createIncident,
  getAllIncidents,
} from "@/lib/incidents/incidentService";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import type { CreateIncidentInput, IncidentSeverity } from "@/lib/types/incident";

const SEVERITIES: IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export async function GET() {
  try {
    return jsonOk({ incidents: await getAllIncidents() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateIncidentInput>;

    if (!body.service || !body.title || !body.description || !body.severity) {
      return jsonError(
        "Missing required fields: service, title, description, severity",
        400,
      );
    }

    if (!SEVERITIES.includes(body.severity)) {
      return jsonError(
        `Invalid severity. Use one of: ${SEVERITIES.join(", ")}`,
        400,
      );
    }

    const incident = await createIncident({
      service: body.service,
      title: body.title,
      description: body.description,
      severity: body.severity,
      errorRate: body.errorRate,
    });

    return jsonOk({ incident }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
