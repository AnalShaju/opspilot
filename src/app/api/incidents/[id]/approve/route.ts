import { approveAndRemediate } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { approved?: boolean };

    if (typeof body.approved !== "boolean") {
      return jsonError('Body must include { "approved": true | false }', 400);
    }

    const incident = await approveAndRemediate(id, body.approved);
    return jsonOk({ incident });
  } catch (error) {
    return handleRouteError(error);
  }
}
