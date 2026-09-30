"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchIncidentHistory } from "@/lib/api/client";
import {
  ACTION_LABELS,
  INCIDENT_TYPE_LABELS,
  formatDateTime,
  formatDuration,
} from "@/lib/format";
import type { IncidentHistoryRecord } from "@/lib/types/history";

export default function HistoryPage() {
  const [records, setRecords] = useState<IncidentHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchIncidentHistory();
        if (!cancelled) setRecords(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">What OpsPilot has learned</div>
        <h2 className="display mt-2 text-[36px] text-ink">Incident History</h2>
        <p className="mt-2 text-[15px] text-muted">
          Verified recoveries. OpsPilot shows the most relevant ones to the AI as
          context during future investigations. It never copies them: current
          evidence always decides.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Loading history…
        </div>
      ) : error ? (
        <p className="text-[14px] text-critical">{error}</p>
      ) : records.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-[13.5px] text-muted">
          No resolved incidents yet. Resolve an incident and it will appear here.
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li key={record.id} className="panel px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[11px] text-faint">
                  {record.incidentId}
                </span>
                <StatusBadge status="resolved" />
                <span className="text-[12px] text-muted">
                  {INCIDENT_TYPE_LABELS[record.incidentType]}
                </span>
              </div>

              <div className="mt-2 text-[16px] font-medium text-ink">
                {record.service}
              </div>
              <p className="mt-1 text-[14px] text-ink-soft">{record.rootCause}</p>

              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="section-label">Action taken</dt>
                  <dd className="mt-1 text-ink">
                    {ACTION_LABELS[record.actionType]}
                    <span className="mono text-muted"> {record.actionTarget}</span>
                  </dd>
                </div>
                <div>
                  <dt className="section-label">Resolution</dt>
                  <dd className="mt-1 text-healthy">Verified recovered</dd>
                </div>
                <div>
                  <dt className="section-label">Resolved</dt>
                  <dd className="mt-1 text-ink">
                    {formatDateTime(record.resolvedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="section-label">Recovery time</dt>
                  <dd className="mono mt-1 text-ink">
                    {formatDuration(record.recoveryDurationMs)}
                  </dd>
                </div>
              </dl>

              <Link
                href={`/incidents/${record.incidentId}`}
                className="mt-3 inline-block text-[12.5px] text-accent transition-colors duration-150 hover:text-[#ea580c]"
              >
                Open incident
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
