import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getIncidentById } from "@/data/incidents";
import { getReportById } from "@/data/reports";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = getReportById(id);
  if (!report) notFound();

  const incident = getIncidentById(report.incidentId);
  if (!incident) notFound();

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
        <div className="section-label">{report.incidentCode}</div>
        <h2 className="display mt-2 text-[36px] text-ink">{report.title}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {report.summary}
        </p>
      </header>

      <dl className="panel divide-y divide-line overflow-hidden">
        <Row label="What broke" value={`${incident.service} · ${incident.summary}`} />
        <Row label="Why" value={report.rootCause} />
        <Row label="What OpsPilot did" value={report.action} />
        <Row label="Result" value={report.result} />
        <Row label="Recovery time" value={report.recoveryTime} mono />
      </dl>

      <Link
        href={`/incidents/${incident.id}`}
        className="inline-flex border border-line px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted"
      >
        Replay investigation
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
