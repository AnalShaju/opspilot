"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { fetchIncidents } from "@/lib/api/client";
import type { Incident } from "@/lib/types/incident";

export default function ReportsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchIncidents();
        if (!cancelled) {
          setIncidents(list.filter((item) => item.status === "resolved"));
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
        <div className="section-label">What happened</div>
        <h2 className="display mt-2 text-[36px] text-ink">Reports</h2>
        <p className="mt-2 text-[15px] text-muted">
          Short summaries of incidents OpsPilot investigated and resolved.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Loading reports…
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/reports/${incident.id}`}
                className="panel block px-5 py-5 transition-colors duration-150 hover:bg-paper-muted"
              >
                <div className="mono text-[11px] text-faint">{incident.code}</div>
                <div className="display mt-2 text-[24px] text-ink">
                  {incident.title}
                </div>
                <div className="mt-2 text-[13.5px] text-muted">
                  Cause: {incident.rootCause?.summary ?? "Unknown"} · Status{" "}
                  {incident.status}
                </div>
              </Link>
            </li>
          ))}
          {incidents.length === 0 ? (
            <li className="panel px-5 py-8 text-center text-[13.5px] text-muted">
              No resolved reports yet. Run an investigation first.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
