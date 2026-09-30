/**
 * Incident store facade over the configured IncidentRepository.
 * Callers should prefer incidentService; this keeps a thin async API for
 * progress updates and tests.
 */

import { getIncidentRepository } from "@/lib/repositories";
import type { Incident } from "@/lib/types/incident";

export async function createIncidentId(): Promise<string> {
  return getIncidentRepository().nextId();
}

export async function listIncidents(): Promise<Incident[]> {
  return getIncidentRepository().list();
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  const found = await getIncidentRepository().getById(id);
  return found ?? undefined;
}

export async function saveIncident(incident: Incident): Promise<Incident> {
  return getIncidentRepository().save(incident);
}

export async function updateIncident(
  id: string,
  patch: Partial<Incident>,
): Promise<Incident | undefined> {
  const existing = await getIncident(id);
  if (!existing) return undefined;

  const updated: Incident = {
    ...existing,
    ...patch,
    id: existing.id,
    code: existing.code,
    updatedAt: new Date().toISOString(),
  };

  return saveIncident(updated);
}

/** Test helper — clears in-memory incidents only. */
export async function clearIncidents(): Promise<void> {
  const repo = getIncidentRepository();
  if ("clear" in repo && typeof repo.clear === "function") {
    repo.clear();
  }
}
