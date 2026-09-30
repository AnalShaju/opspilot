"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { fetchIncident, fetchIncidentReport } from "@/lib/api/client";
import type { Incident, IncidentReport } from "@/lib/types/incident";

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inc, reportPayload] = await Promise.all([
          fetchIncident(id),
          fetchIncidentReport(id),
        ]);
        if (!cancelled) {
          setIncident(inc);
          setReport(reportPayload.report ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 py-20 text-[14px] text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
        Loading report…
      </div>
    );
  }

  if (error || !incident || !report) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <h2 className="display text-[28px] text-ink">Report unavailable</h2>
        <p className="mt-2 text-[14px] text-muted">{error ?? "Not found"}</p>
        <Link href="/reports" className="mt-5 inline-flex text-[13px] text-accent">
          Back to reports
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All reports
      </Link>

      <header className="border-b border-line pb-6">
        <div className="section-label">{incident.code}</div>
        <h2 className="display mt-2 text-[36px] text-ink">{incident.title}</h2>
      </header>

      <dl className="panel divide-y divide-line overflow-hidden">
        <Row label="What broke" value={`${incident.service} · ${incident.description}`} />
        <Row label="Why" value={report.rootCause} />
        <Row
          label="Evidence"
          value={(report.evidenceSummary ?? []).join(" · ") || "—"}
        />
        <Row label="What OpsPilot did" value={report.action} />
        <Row label="Result" value={report.verification} />
        <Row label="Status" value={report.status} />
        {report.recoveryTime ? (
          <Row label="Recovery time" value={report.recoveryTime} mono />
        ) : null}
        {typeof report.confidence === "number" ? (
          <Row
            label="Confidence"
            value={`${Math.round(report.confidence * 100)}%`}
            mono
          />
        ) : null}
      </dl>

      <Link
        href={`/incidents/${incident.id}`}
        className="inline-flex border border-line px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted"
      >
        Open investigation
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
      <dt className="section-label">{label}</dt>
      <dd className={mono ? "mono text-[14px] text-ink" : "text-[14px] text-ink"}>
        {value}
      </dd>
    </div>
  );
}
