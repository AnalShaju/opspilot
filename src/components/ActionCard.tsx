"use client";

import { AlertTriangle, LoaderCircle, ShieldCheck } from "lucide-react";
import type { RecommendedAction } from "@/data/types";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export function ActionCard({
  action,
  phase,
  onApprove,
  embedded = false,
}: {
  action: RecommendedAction;
  phase: "idle" | "running" | "done";
  onApprove: () => void;
  embedded?: boolean;
}) {
  return (
    <section className={cn(!embedded && "panel")}>
      <div className="border-b border-line px-5 py-4">
        {!embedded ? (
          <div className="section-label">{action.title}</div>
        ) : null}
        <h3
          className={cn(
            "display text-[22px] text-ink",
            !embedded && "mt-2",
          )}
        >
          {action.action}
        </h3>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-faint">Risk</span>
          <StatusBadge
            status={
              action.risk === "high"
                ? "critical"
                : action.risk === "medium"
                  ? "medium"
                  : "low"
            }
          />
        </div>

        <p className="text-[14px] leading-relaxed text-ink-soft">
          {action.reason}
        </p>

        {action.requiresApproval && phase === "idle" ? (
          <div className="flex items-start gap-2 border border-warning/25 bg-warning-soft px-3.5 py-3 text-[12.5px] text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Human approval required before OpsPilot can execute this action.
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="flex items-start gap-2 border border-healthy/25 bg-healthy-soft px-3.5 py-3 text-[12.5px] text-healthy">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {action.requiresApproval
              ? "Action approved and completed"
              : "Action completed without rollback"}
          </div>
        ) : null}

        {action.requiresApproval ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={phase !== "idle"}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors duration-150",
              phase === "idle" &&
                "bg-accent text-white hover:bg-[#ea580c] active:bg-[#c2410c]",
              phase === "running" &&
                "cursor-wait border border-line bg-paper-muted text-muted",
              phase === "done" &&
                "cursor-default border border-healthy/30 bg-healthy-soft text-healthy",
            )}
          >
            {phase === "running" ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Executing rollback…
              </>
            ) : phase === "done" ? (
              <>
                <ShieldCheck className="h-4 w-4" />
                Rollback Complete
              </>
            ) : (
              "Approve Rollback"
            )}
          </button>
        ) : null}
      </div>
    </section>
  );
}
