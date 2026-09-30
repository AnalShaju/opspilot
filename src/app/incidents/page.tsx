"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { incidents } from "@/data/incidents";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "resolved";

export default function IncidentsPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "active") {
      return incidents.filter((i) => i.status !== "resolved");
    }
    if (filter === "resolved") {
      return incidents.filter((i) => i.status === "resolved");
    }
    return incidents;
  }, [filter]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">What happened</div>
        <h2 className="display mt-2 text-[36px] text-ink">Incidents</h2>
        <p className="mt-2 text-[15px] text-muted">
          Open an incident to follow OpsPilot’s investigation.
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
                <StatusBadge status={incident.status} />
              </div>
              <div className="mt-2 text-[16px] font-medium text-ink">
                {incident.service}
              </div>
              <div className="mt-1 text-[13.5px] text-muted">
                {incident.summary}
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="panel px-5 py-8 text-center text-[13.5px] text-muted">
            No incidents match this filter.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
