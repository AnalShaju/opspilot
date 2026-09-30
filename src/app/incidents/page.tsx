"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchIncidents, syncIncidents } from "@/lib/api/client";
import type { Incident } from "@/lib/types/incident";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "resolved";

function isActive(incident: Incident): boolean {
  return (
    incident.status !== "resolved" &&
    incident.status !== "failed" &&
    incident.status !== "investigation_failed"
  );
}

export default function IncidentsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const synced = await syncIncidents();
        const list =
          synced.incidents.length > 0
            ? synced.incidents
            : await fetchIncidents();
        if (!cancelled) {
          setIncidents(list);
          if ((synced.activeIncidents?.length ?? 0) > 0) {
            setFilter("active");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load incidents");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "active") {
      return incidents.filter(isActive);
    }
    if (filter === "resolved") {
      return incidents.filter((i) => i.status === "resolved");
    }
    return incidents;
  }, [filter, incidents]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">What happened</div>
        <h2 className="display mt-2 text-[36px] text-ink">Incidents</h2>
        <p className="mt-2 text-[15px] text-muted">
          Synced from the simulator. Open any incident to investigate that
          service — selection is never forced to Payment.
        </p>
      </header>

      <div className="flex w-fit flex-wrap border border-line bg-paper">
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["resolved", "Resolved"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "border-r border-line px-4 py-2 text-[12.5px] transition-colors duration-150 last:border-r-0",
              filter === key
                ? "bg-accent-soft text-ink"
                : "text-muted hover:bg-paper-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Syncing incidents…
        </div>
      ) : error ? (
        <div className="panel px-5 py-8 text-center text-[13.5px] text-critical">
          {error}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/incidents/${incident.id}`}
                className="panel block px-5 py-4 transition-colors duration-150 hover:bg-paper-muted"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[11px] text-faint">
                    {incident.code}
                  </span>
                  <StatusBadge status={incident.severity} />
                  <StatusBadge
                    status={
                      incident.status === "awaiting_approval"
                        ? "awaiting_approval"
                        : incident.status === "resolved"
                          ? "resolved"
                          : incident.status === "investigating"
                            ? "investigating"
                            : "critical"
                    }
                  />
                </div>
                <div className="mt-2 text-[16px] font-medium text-ink">
                  {incident.service}
                </div>
                <div className="mt-1 text-[13.5px] text-muted">
                  {incident.title}
                </div>
                <div className="mt-1 text-[12.5px] text-faint">
                  {incident.description}
                </div>
              </Link>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="panel px-5 py-8 text-center text-[13.5px] text-muted">
              No incidents match this filter. Trigger a simulator failure or run
              a Resilience Test.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
