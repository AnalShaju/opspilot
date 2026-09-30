/**
 * Incident history persistence boundary.
 *
 * Services depend ONLY on the IncidentHistoryRepository interface.
 * To move to Supabase, implement this interface (SupabaseIncidentHistoryRepository)
 * and return it from `createIncidentHistoryRepository()` in ./index.ts.
 * No service, route, or UI code needs to change.
 */

import type {
  HistoryListQuery,
  IncidentHistoryRecord,
  NewIncidentHistoryRecord,
  RelevantIncidentQuery,
} from "@/lib/types/history";

export const DEFAULT_RELEVANT_LIMIT = 3;
export const MAX_RELEVANT_LIMIT = 5;

export interface IncidentHistoryRepository {
  /** Store a verified recovery. This is the learning material. */
  saveResolvedIncident(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord>;

  /**
   * Store an unsuccessful attempt (remediation or verification failed).
   * Kept separate: never returned as resolved / relevant history.
   */
  saveFailedAttempt(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord>;

  /** Verified recoveries only, newest first. */
  getResolvedIncidents(
    query?: HistoryListQuery,
  ): Promise<IncidentHistoryRecord[]>;

  /** Unsuccessful attempts, newest first. */
  getFailedAttempts(limit?: number): Promise<IncidentHistoryRecord[]>;

  /**
   * Deterministic matching (no vectors / embeddings):
   * same service, same incident type, similar action type.
   * Resolved incidents only, capped at 5.
   */
  getRelevantPreviousIncidents(
    query: RelevantIncidentQuery,
  ): Promise<IncidentHistoryRecord[]>;

  /** Look up by history record id, or by source incident id (latest). */
  getIncidentById(id: string): Promise<IncidentHistoryRecord | null>;
}

/** Score used by every implementation so behavior stays consistent. */
export function relevanceScore(
  record: IncidentHistoryRecord,
  query: RelevantIncidentQuery,
): number {
  let score = 0;
  if (record.service.toLowerCase() === query.service.toLowerCase()) score += 2;
  if (
    query.incidentType &&
    query.incidentType !== "unknown" &&
    record.incidentType === query.incidentType
  ) {
    score += 2;
  }
  if (query.actionType && record.actionType === query.actionType) score += 1;
  return score;
}

export function clampRelevantLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
    return DEFAULT_RELEVANT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_RELEVANT_LIMIT);
}

/**
 * Temporary in-memory implementation.
 * Uses globalThis so Next.js hot reload does not wipe history in dev.
 */
export class InMemoryIncidentHistoryRepository
  implements IncidentHistoryRepository
{
  private resolved: IncidentHistoryRecord[] = [];
  private failed: IncidentHistoryRecord[] = [];
  private seq = 1;

  private nextId(): string {
    const id = `HIST-${String(this.seq).padStart(3, "0")}`;
    this.seq += 1;
    return id;
  }

  private build(input: NewIncidentHistoryRecord): IncidentHistoryRecord {
    return {
      ...input,
      evidenceSummary: [...input.evidenceSummary],
      id: this.nextId(),
      createdAt: new Date().toISOString(),
    };
  }

  async saveResolvedIncident(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord> {
    const record = this.build({ ...input, outcome: "resolved" });
    this.resolved.push(record);
    return record;
  }

  async saveFailedAttempt(
    input: NewIncidentHistoryRecord,
  ): Promise<IncidentHistoryRecord> {
    const record = this.build({ ...input, outcome: "failed" });
    this.failed.push(record);
    return record;
  }

  async getResolvedIncidents(
    query: HistoryListQuery = {},
  ): Promise<IncidentHistoryRecord[]> {
    const rows = this.resolved.filter(
      (record) =>
        (!query.service ||
          record.service.toLowerCase() === query.service.toLowerCase()) &&
        (!query.incidentType || record.incidentType === query.incidentType) &&
        (!query.actionType || record.actionType === query.actionType),
    );
    return newestFirst(rows).slice(0, query.limit ?? rows.length);
  }

  async getFailedAttempts(limit?: number): Promise<IncidentHistoryRecord[]> {
    return newestFirst(this.failed).slice(0, limit ?? this.failed.length);
  }

  async getRelevantPreviousIncidents(
    query: RelevantIncidentQuery,
  ): Promise<IncidentHistoryRecord[]> {
    const limit = clampRelevantLimit(query.limit);

    // Require a service OR incident-type match; action alone is not relevant.
    return this.resolved
      .map((record) => ({ record, score: relevanceScore(record, query) }))
      .filter(({ record, score }) => {
        if (score === 0) return false;
        const serviceMatch =
          record.service.toLowerCase() === query.service.toLowerCase();
        const typeMatch =
          !!query.incidentType &&
          query.incidentType !== "unknown" &&
          record.incidentType === query.incidentType;
        return serviceMatch || typeMatch;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.record.resolvedAt.localeCompare(a.record.resolvedAt),
      )
      .slice(0, limit)
      .map(({ record }) => record);
  }

  async getIncidentById(id: string): Promise<IncidentHistoryRecord | null> {
    const all = [...this.resolved, ...this.failed];
    const byId = all.find((record) => record.id === id);
    if (byId) return byId;
    const byIncident = newestFirst(
      all.filter((record) => record.incidentId === id),
    );
    return byIncident[0] ?? null;
  }

  /** Test helper. */
  clear(): void {
    this.resolved = [];
    this.failed = [];
    this.seq = 1;
  }
}

function newestFirst(rows: IncidentHistoryRecord[]): IncidentHistoryRecord[] {
  return [...rows].sort(
    (a, b) =>
      b.resolvedAt.localeCompare(a.resolvedAt) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}
