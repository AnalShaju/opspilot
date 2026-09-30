import type { RootCause } from "@/data/types";
import { cn } from "@/lib/utils";

export function RootCauseCard({
  rootCause,
  embedded = false,
}: {
  rootCause: RootCause;
  embedded?: boolean;
}) {
  return (
    <section className={cn(!embedded && "panel")}>
      {!embedded ? (
        <div className="border-b border-line px-5 py-4">
          <div className="section-label">{rootCause.title}</div>
          <h3 className="display mt-2 text-[26px] text-ink">{rootCause.target}</h3>
        </div>
      ) : (
        <div className="border-b border-line px-5 py-4">
          <h3 className="display text-[26px] text-ink">{rootCause.target}</h3>
        </div>
      )}
      <div className="px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted">Confidence</span>
          <span className="mono text-[13px] font-medium text-accent">
            {rootCause.confidence}%
          </span>
        </div>
        <div
          className="mt-2.5 h-1 overflow-hidden bg-paper-muted"
          role="progressbar"
          aria-valuenow={rootCause.confidence}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Root cause confidence"
        >
          <div
            className="h-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${rootCause.confidence}%` }}
          />
        </div>
        <p className="mt-5 text-[14px] leading-relaxed text-ink-soft">
          {rootCause.explanation}
        </p>
      </div>
    </section>
  );
}
