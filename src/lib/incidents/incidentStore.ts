/**
 * In-memory incident store (hackathon MVP).
 * Uses globalThis so Next.js hot reload does not wipe incidents in dev.
 */

import type { Incident } from "@/lib/types/incident";

type StoreShape = {
  incidents: Map<string, Incident>;
  seq: number;
};

const GLOBAL_KEY = "__opspilot_incident_store__";

function getStore(): StoreShape {
  const globalRef = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: StoreShape;
  };

  if (!globalRef[GLOBAL_KEY]) {
    globalRef[GLOBAL_KEY] = {
      incidents: new Map(),
      seq: 1,
    };
  }

  return globalRef[GLOBAL_KEY];
}

export function createIncidentId(): string {
  const store = getStore();
  const id = `INC-${String(store.seq).padStart(3, "0")}`;
  store.seq += 1;
  return id;
}

export function listIncidents(): Incident[] {
  return Array.from(getStore().incidents.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getIncident(id: string): Incident | undefined {
  return getStore().incidents.get(id);
}

export function saveIncident(incident: Incident): Incident {
  getStore().incidents.set(incident.id, incident);
  return incident;
}

export function updateIncident(
  id: string,
  patch: Partial<Incident>,
): Incident | undefined {
  const existing = getIncident(id);
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

/** Test helper — clears all incidents. */
export function clearIncidents(): void {
  const store = getStore();
  store.incidents.clear();
  store.seq = 1;
}
