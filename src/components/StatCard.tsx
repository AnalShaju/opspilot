import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "critical" | "healthy" | "warning";
  icon?: LucideIcon;
}) {
  const valueColor = {
    default: "text-ink",
    critical: "text-critical",
    healthy: "text-healthy",
    warning: "text-warning",
  }[tone];

  return (
    <div className="panel px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="section-label">{label}</div>
        {Icon ? (
          <Icon className="h-3.5 w-3.5 text-faint" strokeWidth={1.75} />
        ) : null}
      </div>
      <div
        className={cn(
          "mt-3 display text-[28px] tracking-tight",
          valueColor,
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-2 text-[12px] text-faint">{hint}</div> : null}
    </div>
  );
}
