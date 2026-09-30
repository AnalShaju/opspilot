/**
 * Incident persistence boundary.
 *
 * Services depend on this interface. In-memory backs unit tests; Supabase
 * backs the running app when credentials are configured.
 */

import type { Incident } from "@/lib/types/incident";

export interface IncidentRepository {
  nextId(): Promise<string>;
  list(): Promise<Incident[]>;
  getById(id: string): Promise<Incident | null>;
  /** Insert or replace the full incident document (+ related rows in Supabase). */
  save(incident: Incident): Promise<Incident>;
}

/**
 * Temporary in-memory store. Kept for unit tests and offline demos.
 * Uses globalThis so Next.js HMR does not wipe data in memory mode.
 */
export class InMemoryIncidentRepository implements IncidentRepository {
  private incidents = new Map<string, Incident>();
  private seq = 1;

  async nextId(): Promise<string> {
    const id = `INC-${String(this.seq).padStart(3, "0")}`;
    this.seq += 1;
    return id;
  }

  async list(): Promise<Incident[]> {
    return Array.from(this.incidents.values())
      .map((item) => structuredClone(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getById(id: string): Promise<Incident | null> {
    const found = this.incidents.get(id);
    return found ? structuredClone(found) : null;
  }

  async save(incident: Incident): Promise<Incident> {
    const copy = structuredClone(incident);
    this.incidents.set(copy.id, copy);
    return structuredClone(copy);
  }

  /** Test helper. */
  clear(): void {
    this.incidents.clear();
    this.seq = 1;
  }
}
