/**
 * Maps OpsPilot domain statuses <-> the check constraints on the live
 * Supabase schema (discovered via probe):
 *
 * incidents.status: open | investigating | awaiting_approval | remediating | resolved | failed
 * resilience stage: pending | success | failed
 * resilience overall: pending | running | passed | failed
 * remediation approval: pending | approved | rejected
 * remediation execution: pending | running | success | failed
 */

import type { IncidentStatus } from "@/lib/types/incident";
import type {
  ResilienceOverallStatus,
  StageStatus,
} from "@/lib/types/resilience";

export function incidentStatusToDb(status: IncidentStatus): string {
  switch (status) {
    case "detected":
      return "open";
    case "investigating":
      return "investigating";
    case "awaiting_approval":
      return "awaiting_approval";
    case "remediating":
    case "verifying":
      return "remediating";
    case "resolved":
      return "resolved";
    case "failed":
    case "investigation_failed":
      return "failed";
    default:
      return "open";
  }
}

export function incidentStatusFromDb(
  status: string,
  hints: {
    investigationFailed?: boolean;
    verifying?: boolean;
  } = {},
): IncidentStatus {
  if (status === "open") return "detected";
  if (status === "investigating") return "investigating";
  if (status === "awaiting_approval") return "awaiting_approval";
  if (status === "resolved") return "resolved";
  if (status === "failed") {
    return hints.investigationFailed ? "investigation_failed" : "failed";
  }
  if (status === "remediating") {
    return hints.verifying ? "verifying" : "remediating";
  }
  return "detected";
}

export function stageToDb(status: StageStatus): string {
  if (status === "passed") return "success";
  if (status === "failed") return "failed";
  return "pending";
}

export function stageFromDb(status: string | null | undefined): StageStatus {
  if (status === "success" || status === "approved") return "passed";
  if (status === "failed" || status === "rejected") return "failed";
  return "pending";
}

/** resilience_tests.approval_status uses pending|approved|rejected. */
export function approvalStageToDb(status: StageStatus): string {
  if (status === "passed") return "approved";
  if (status === "failed") return "rejected";
  return "pending";
}

export function approvalStageFromDb(
  status: string | null | undefined,
): StageStatus {
  if (status === "approved") return "passed";
  if (status === "rejected") return "failed";
  return "pending";
}

export function overallToDb(status: ResilienceOverallStatus): string {
  if (status === "cancelled") return "failed";
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "pending";
}

export function overallFromDb(
  status: string,
  failureReason: string | null,
): ResilienceOverallStatus {
  if (status === "passed") return "passed";
  if (status === "running") return "running";
  if (status === "pending") return "running";
  if (
    failureReason &&
    /cancel/i.test(failureReason)
  ) {
    return "cancelled";
  }
  return "failed";
}

export function msToSeconds(ms: number | null | undefined): number | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
}

export function secondsToMs(seconds: number | null | undefined): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return Math.max(0, Math.round(seconds * 1000));
}

export function summaryToText(items: string[] | undefined): string {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).join("\n");
}

export function summaryFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
