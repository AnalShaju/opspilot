import { cn } from "@/lib/utils";
import type {
  DeploymentStatus,
  IncidentSeverity,
  IncidentStatus,
  ServiceHealth,
} from "@/data/types";

type BadgeKind =
  | IncidentSeverity
  | IncidentStatus
  | ServiceHealth
  | DeploymentStatus
  | "active"
  | "resolved_label";

const styles: Record<string, string> = {
  critical: "text-critical border-critical/25 bg-critical-soft",
  high: "text-warning border-warning/25 bg-warning-soft",
  medium: "text-warning border-warning/25 bg-warning-soft",
  low: "text-muted border-line bg-paper-muted",
  investigating: "text-accent border-accent/30 bg-accent-soft",
  awaiting_approval: "text-warning border-warning/25 bg-warning-soft",
  rollback_in_progress: "text-accent border-accent/30 bg-accent-soft",
  resolved: "text-healthy border-healthy/25 bg-healthy-soft",
  healthy: "text-healthy border-healthy/25 bg-healthy-soft",
  degraded: "text-warning border-warning/25 bg-warning-soft",
  unknown: "text-muted border-line bg-paper-muted",
  successful: "text-healthy border-healthy/25 bg-healthy-soft",
  deployed: "text-muted border-line bg-paper-muted",
  failed: "text-critical border-critical/25 bg-critical-soft",
  rolled_back: "text-warning border-warning/25 bg-warning-soft",
  triggered_incident: "text-critical border-critical/25 bg-critical-soft",
  active: "text-critical border-critical/25 bg-critical-soft",
  resolved_label: "text-healthy border-healthy/25 bg-healthy-soft",
};

const labels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  investigating: "Investigating",
  awaiting_approval: "Awaiting Approval",
  rollback_in_progress: "Rollback in Progress",
  resolved: "Resolved",
  healthy: "Healthy",
  degraded: "Degraded",
  unknown: "Unknown",
  successful: "Successful",
  deployed: "Deployed",
  failed: "Failed",
  rolled_back: "Rolled Back",
  triggered_incident: "Triggered Incident",
  active: "Active",
  resolved_label: "Resolved",
};

export function StatusBadge({
  status,
  className,
}: {
  status: BadgeKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-0.5 text-[10.5px] font-medium leading-none tracking-wide",
        styles[status] ?? styles.unknown,
        className,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
