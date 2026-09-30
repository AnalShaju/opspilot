/**
 * Server-only Supabase client (service role).
 *
 * Use ONLY from API routes, repositories, and other server modules.
 * Never import this from client components or expose the key via NEXT_PUBLIC_*.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const GLOBAL_KEY = "__opspilot_supabase_admin__";

export type OpsPilotSupabase = SupabaseClient;

function readUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

function readServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

/** True when credentials are present and memory storage is not forced. */
export function isSupabaseConfigured(): boolean {
  if (process.env.STORAGE_DRIVER === "memory") return false;
  if (process.env.STORAGE_DRIVER === "supabase") {
    return Boolean(readUrl() && readServiceRoleKey());
  }
  return Boolean(readUrl() && readServiceRoleKey());
}

export function getSupabaseAdmin(): OpsPilotSupabase {
  const url = readUrl();
  const key = readServiceRoleKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const globalRef = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: OpsPilotSupabase;
  };

  if (!globalRef[GLOBAL_KEY]) {
    globalRef[GLOBAL_KEY] = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return globalRef[GLOBAL_KEY];
}

/** Test helper — drop the cached client so env changes take effect. */
export function resetSupabaseAdminForTests(): void {
  const globalRef = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: OpsPilotSupabase;
  };
  delete globalRef[GLOBAL_KEY];
}
