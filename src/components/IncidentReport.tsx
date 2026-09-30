import Link from "next/link";
import type { Incident, IncidentReport as ReportType } from "@/data/types";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export function IncidentReportView({
  incident,
  report,
  compact = false,
  embedded = false,
}: {
  incident: Incident;
  report: ReportType;
  compact?: boolean;
  embedded?: boolean;
}) {
  return (
    <section className={cn(!embedded && "panel", "animate-fade-in")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          {!embedded ? (
            <div className="section-label">Incident Report</div>
          ) : null}
          <h3
            className={cn(
              "display text-[24px] text-ink",
              !embedded && "mt-2",
            )}
          >
            {report.title}
          </h3>
        </div>
        <StatusBadge status="resolved" />
      </div>

      <dl className="divide-y divide-line">
        <Row label="Incident" value={`${incident.service} 500 Errors`} />
        <Row label="Root Cause" value={report.rootCause} />
        <Row
          label="Evidence"
          value={
            <ul className="space-y-1.5">
              {report.evidence.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-faint">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          }
        />
        <Row label="Action" value={report.action} />
        <Row label="Result" value={report.result} />
        <Row label="Status" value="Resolved" />
        <Row label="Recovery Time" value={report.recoveryTime} mono />
      </dl>

      {!compact ? (
        <div className="border-t border-line px-5 py-4">
          <Link
            href={`/reports/${report.id}`}
            className="inline-flex items-center border border-line px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:border-line-strong hover:bg-paper-muted"
          >
            View Full Report
          </Link>
        </div>
      ) : (
        <div className="border-t border-line px-5 py-5">
          <p className="text-[14px] leading-relaxed text-ink-soft">
            {report.summary}
          </p>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr] sm:gap-6">
      <dt className="section-label pt-0.5">{label}</dt>
      <dd
        className={
          mono
            ? "mono text-[13.5px] text-ink"
            : "text-[13.5px] leading-relaxed text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
