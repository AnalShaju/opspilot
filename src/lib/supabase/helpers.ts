/**
 * Shared helpers for Supabase repositories (id sequencing, JSON clones).
 */

import type { OpsPilotSupabase } from "@/lib/supabase/server";
import { throwStorageError } from "@/lib/supabase/errors";

export function cloneJson<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

/** Parse INC-012 / HIST-003 / RT-007 style ids and return the next one. */
export async function nextPrefixedId(
  client: OpsPilotSupabase,
  table: string,
  column: string,
  prefix: string,
): Promise<string> {
  const { data, error } = await client
    .from(table)
    .select(column)
    .like(column, `${prefix}-%`)
    .order(column, { ascending: false })
    .limit(50);

  if (error) throwStorageError(`allocating next ${prefix} id`, error);

  let max = 0;
  for (const row of data ?? []) {
    const value = String(
      (row as unknown as Record<string, unknown>)[column] ?? "",
    );
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }

  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
