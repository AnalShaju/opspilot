import type { Incident } from "@/lib/types/incident";

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

export async function bootstrapDemoIncident(): Promise<Incident> {
  const response = await fetch("/api/demo/bootstrap", { method: "POST" });
  const data = await parseJson<{ incident: Incident }>(response);
  return data.incident;
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
  const response = await fetch(`/api/incidents/${id}/investigate`, {
    method: "POST",
  });
  const data = await parseJson<{ incident: Incident }>(response);
  return data.incident;
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
