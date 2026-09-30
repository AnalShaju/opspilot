import { investigateIncidentWithAi } from "@/lib/incidents/incidentService";
import { handleRouteError, jsonOk } from "@/lib/api/http";

/** Allow enough time for simulator evidence + one DeepSeek call on Vercel. */
export const maxDuration = 60;

/**
 * Runs the DeepSeek incident agent once: evidence is collected first,
 * then a single JSON diagnosis call returns root cause + recommended action.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await investigateIncidentWithAi(id);
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
