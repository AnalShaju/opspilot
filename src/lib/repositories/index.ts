/**
 * Repository factory — the ONE place that decides which storage backs the
 * new features.
 *
 * Today: in-memory (cached on globalThis so HMR keeps data in dev).
 * Next:  Supabase. Implement the two interfaces and switch here, e.g.
 *
 *   if (process.env.STORAGE_DRIVER === "supabase") {
 *     return new SupabaseIncidentHistoryRepository(...);
 *   }
 */

import {
  InMemoryIncidentHistoryRepository,
  type IncidentHistoryRepository,
} from "@/lib/repositories/incident-history.repository";
import {
  InMemoryResilienceTestRepository,
  type ResilienceTestRepository,
} from "@/lib/repositories/resilience-test.repository";

export type {
  IncidentHistoryRepository,
  ResilienceTestRepository,
};

type Registry = {
  history?: IncidentHistoryRepository;
  resilience?: ResilienceTestRepository;
};

const GLOBAL_KEY = "__opspilot_repositories__";

function registry(): Registry {
  const globalRef = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Registry;
  };
  if (!globalRef[GLOBAL_KEY]) globalRef[GLOBAL_KEY] = {};
  return globalRef[GLOBAL_KEY];
}

export function getIncidentHistoryRepository(): IncidentHistoryRepository {
  const reg = registry();
  if (!reg.history) reg.history = new InMemoryIncidentHistoryRepository();
  return reg.history;
}

export function getResilienceTestRepository(): ResilienceTestRepository {
  const reg = registry();
  if (!reg.resilience) reg.resilience = new InMemoryResilienceTestRepository();
  return reg.resilience;
}

/** Swap implementations (tests, or wiring Supabase at startup). */
export function setIncidentHistoryRepository(
  repository: IncidentHistoryRepository | null,
): void {
  registry().history = repository ?? undefined;
}

export function setResilienceTestRepository(
  repository: ResilienceTestRepository | null,
): void {
  registry().resilience = repository ?? undefined;
}
