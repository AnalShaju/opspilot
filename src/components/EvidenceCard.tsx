import {
  FileText,
  HeartPulse,
  History,
  LineChart,
  Rocket,
} from "lucide-react";
import type { EvidenceItem, EvidenceType } from "@/data/types";

const iconMap: Record<EvidenceType, typeof FileText> = {
  logs: FileText,
  metrics: LineChart,
  deployment: Rocket,
  service_health: HeartPulse,
  previous_incident: History,
};

export function EvidenceCard({ evidence }: { evidence: EvidenceItem }) {
  const Icon = iconMap[evidence.type];

  return (
    <article className="panel flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
          <h3 className="text-[13px] font-medium text-ink">{evidence.title}</h3>
        </div>
        {evidence.timestamp ? (
          <span className="mono shrink-0 text-[11px] text-faint">
            {evidence.timestamp}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="text-[13.5px] leading-snug text-ink">{evidence.summary}</p>
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {evidence.details.map((detail) => (
            <li
              key={detail}
              className="mono text-[11px] leading-relaxed text-muted"
            >
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
