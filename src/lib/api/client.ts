import type { IncidentHistoryRecord } from "@/lib/types/history";
import type { Incident } from "@/lib/types/incident";
import type {
  ResilienceScenarioDefinition,
  ResilienceTest,
} from "@/lib/types/resilience";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof data === "object" && data && "error" in data && data.error
        ? String(data.error)
        : `Request failed (${response.status})`,
    );
  }
  return data;
}

export async function syncIncidents(): Promise<{
  incidents: Incident[];
  activeIncidents: Incident[];
  created: Incident[];
  superseded: Incident[];
  incident: Incident | null;
  openSimulatorCount: number;
}> {
  const response = await fetch("/api/incidents/sync", {
    method: "POST",
    cache: "no-store",
  });
  return parseJson(response);
}

export async function fetchIncident(id: string): Promise<Incident> {
  const response = await fetch(`/api/incidents/${id}`, { cache: "no-store" });
  const data = await parseJson<{ incident: Incident }>(response);
  return data.incident;
}

export async function fetchIncidents(): Promise<Incident[]> {
  const response = await fetch("/api/incidents", { cache: "no-store" });
  const data = await parseJson<{ incidents: Incident[] }>(response);
  return data.incidents;
}

export async function investigateIncident(id: string): Promise<Incident> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(`/api/incidents/${id}/investigate`, {
      method: "POST",
      signal: controller.signal,
    });
    const data = await parseJson<{ incident: Incident }>(response);
    return data.incident;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Investigation timed out. On Vercel, set SIMULATOR_URL to a public simulator https URL (not localhost), or set USE_MOCK_SIMULATOR=true.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function approveIncident(
  id: string,
  approved = true,
): Promise<Incident> {
  const response = await fetch(`/api/incidents/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  const data = await parseJson<{ incident: Incident }>(response);
  return data.incident;
}

export async function fetchIncidentReport(id: string) {
  const response = await fetch(`/api/incidents/${id}/report`, {
    cache: "no-store",
  });
  return parseJson<{ report: Incident["report"] }>(response);
}

export async function fetchIncidentHistory(): Promise<IncidentHistoryRecord[]> {
  const response = await fetch("/api/incidents/history", { cache: "no-store" });
  const data = await parseJson<{ records: IncidentHistoryRecord[] }>(response);
  return data.records;
}

export async function fetchSimulatorHealth(): Promise<{
  healthy: boolean;
  activeScenario: string | null;
  recovered: boolean | null;
}> {
  const response = await fetch("/api/simulator/health", { cache: "no-store" });
  return parseJson(response);
}

export async function fetchResilience(): Promise<{
  scenarios: ResilienceScenarioDefinition[];
  tests: ResilienceTest[];
}> {
  const response = await fetch("/api/resilience-tests", { cache: "no-store" });
  return parseJson(response);
}

export async function fetchResilienceTest(id: string): Promise<ResilienceTest> {
  const response = await fetch(`/api/resilience-tests/${id}`, {
    cache: "no-store",
  });
  const data = await parseJson<{ test: ResilienceTest }>(response);
  return data.test;
}

export async function startResilienceTest(
  scenarioId: string,
): Promise<ResilienceTest> {
  const response = await fetch("/api/resilience-tests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId }),
  });
  const data = await parseJson<{ test: ResilienceTest }>(response);
  return data.test;
}

export async function cancelResilienceTest(id: string): Promise<ResilienceTest> {
  const response = await fetch(`/api/resilience-tests/${id}/cancel`, {
    method: "POST",
  });
  const data = await parseJson<{ test: ResilienceTest }>(response);
  return data.test;
}
