import type { ActionType, IncidentType } from "@/lib/types/incident";

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  deployment_regression: "Deployment regression",
  cache_failure: "Cache failure",
  database_failure: "Database failure",
  unknown: "Unclassified",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  rollback: "Rollback",
  restart_redis: "Restart Redis",
  recover_database: "Recover database",
};

/** "42s", "1m 05s". Null when the duration is unknown. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "unknown";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
