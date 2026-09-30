/**
 * Repository factory — the ONE place that decides which storage backs OpsPilot.
 *
 * - Supabase when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 * - In-memory otherwise (and always when STORAGE_DRIVER=memory)
 *
 * Tests inject in-memory repos via the set* helpers.
 */

import {
  InMemoryIncidentRepository,
  type IncidentRepository,
} from "@/lib/repositories/incident.repository";
import {
  InMemoryIncidentHistoryRepository,
  type IncidentHistoryRepository,
} from "@/lib/repositories/incident-history.repository";
import {
  InMemoryResilienceTestRepository,
  type ResilienceTestRepository,
} from "@/lib/repositories/resilience-test.repository";
import { SupabaseIncidentRepository } from "@/lib/repositories/supabase-incident.repository";
import { SupabaseIncidentHistoryRepository } from "@/lib/repositories/supabase-incident-history.repository";
import { SupabaseResilienceTestRepository } from "@/lib/repositories/supabase-resilience-test.repository";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export type {
  IncidentRepository,
  IncidentHistoryRepository,
  ResilienceTestRepository,
};

type Registry = {
  incidents?: IncidentRepository;
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

function createIncidentRepository(): IncidentRepository {
  return isSupabaseConfigured()
    ? new SupabaseIncidentRepository()
    : new InMemoryIncidentRepository();
}

function createHistoryRepository(): IncidentHistoryRepository {
  return isSupabaseConfigured()
    ? new SupabaseIncidentHistoryRepository()
    : new InMemoryIncidentHistoryRepository();
}

function createResilienceRepository(): ResilienceTestRepository {
  return isSupabaseConfigured()
    ? new SupabaseResilienceTestRepository()
    : new InMemoryResilienceTestRepository();
}

export function getIncidentRepository(): IncidentRepository {
  const reg = registry();
  if (!reg.incidents) reg.incidents = createIncidentRepository();
  return reg.incidents;
}

export function getIncidentHistoryRepository(): IncidentHistoryRepository {
  const reg = registry();
  if (!reg.history) reg.history = createHistoryRepository();
  return reg.history;
}

export function getResilienceTestRepository(): ResilienceTestRepository {
  const reg = registry();
  if (!reg.resilience) reg.resilience = createResilienceRepository();
  return reg.resilience;
}

/** Swap implementations (tests, or forcing a driver at startup). */
export function setIncidentRepository(
  repository: IncidentRepository | null,
): void {
  registry().incidents = repository ?? undefined;
}

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
