import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Service } from "@/data/types";
import { StatusBadge } from "@/components/StatusBadge";

const dotColor: Record<Service["status"], string> = {
  healthy: "bg-healthy",
  degraded: "bg-warning",
  critical: "bg-critical animate-pulse-dot",
  unknown: "bg-faint",
};

export function ServiceStatus({
  service,
  compact = false,
}: {
  service: Service;
  compact?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150",
        service.incidentId && "hover:bg-paper-muted",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor[service.status])}
          aria-hidden
        />
        <span className="truncate text-[13.5px] text-ink">{service.name}</span>
      </div>
      {compact ? (
        <span
          className={cn(
            "text-[12px]",
            service.status === "healthy" && "text-healthy",
            service.status === "critical" && "text-critical",
            service.status === "degraded" && "text-warning",
            service.status === "unknown" && "text-muted",
          )}
        >
          {service.status === "healthy"
            ? "Healthy"
            : service.status === "critical"
              ? "Critical"
              : service.status === "degraded"
                ? "Degraded"
                : "Unknown"}
        </span>
      ) : (
        <StatusBadge status={service.status} />
      )}
    </div>
  );

  if (service.incidentId) {
    return (
      <Link href={`/incidents/${service.incidentId}`} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
