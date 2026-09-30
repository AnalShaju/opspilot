import { notFound } from "next/navigation";
import { IncidentDetailClient } from "@/components/IncidentDetailClient";
import { getIncidentById } from "@/data/incidents";
import { getReportByIncidentId } from "@/data/reports";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incident = getIncidentById(id);

  if (!incident) notFound();

  const report = getReportByIncidentId(incident.id);
  if (!report) notFound();

  return <IncidentDetailClient incident={incident} report={report} />;
}
