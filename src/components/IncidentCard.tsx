import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import type { Incident } from "@/data/types";
import { StatusBadge } from "@/components/StatusBadge";

export function IncidentCard({
  incident,
  featured = false,
}: {
  incident: Incident;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={incident.severity} />
            <span className="mono text-[11px] text-faint">{incident.code}</span>
          </div>
          <h3 className="display mt-3 text-[26px] text-ink">
            {incident.service}
          </h3>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
            {incident.summary}
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          <div className="px-5 py-4">
            <div className="section-label">Started</div>
            <div className="mono mt-1.5 text-[13px] text-ink">
              {incident.startedLabel}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="section-label">Duration</div>
            <div className="mono mt-1.5 text-[13px] text-ink">
              {incident.durationLabel}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="section-label">Error rate</div>
            <div className="mono mt-1.5 text-[13px] text-critical">
              {incident.errorRate}%
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <Link
            href={`/incidents/${incident.id}`}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
          >
            Investigate Incident
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="panel flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-paper-muted"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-[12px] text-faint">{incident.code}</span>
          <StatusBadge status={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
        <div className="mt-2 truncate text-[14px] font-medium text-ink">
          {incident.service}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted">
          {incident.summary}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 text-[12px] text-faint sm:flex">
        <Clock className="h-3.5 w-3.5" />
        <span className="mono">{incident.relativeTime}</span>
      </div>
    </Link>
  );
}
