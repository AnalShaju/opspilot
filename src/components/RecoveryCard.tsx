import { Check, LoaderCircle } from "lucide-react";
import type { RecoveryMetrics } from "@/data/types";
import { cn } from "@/lib/utils";

type RecoveryPhase = "waiting" | "executing" | "verified";

const steps = [
  "Deployment rolled back",
  "Payment service restarted",
  "Health check completed",
];

export function RecoveryCard({
  phase,
  metrics,
  progressStep,
  embedded = false,
}: {
  phase: RecoveryPhase;
  metrics: RecoveryMetrics;
  progressStep: number;
  embedded?: boolean;
}) {
  return (
    <section className={cn(!embedded && "panel")}>
      <div className="border-b border-line px-5 py-4">
        {!embedded ? <div className="section-label">Recovery</div> : null}
        <h3
          className={cn(
            "display text-[22px] text-ink",
            !embedded && "mt-2",
          )}
        >
          {phase === "waiting" && "Waiting for approval"}
          {phase === "executing" && "Executing recovery…"}
          {phase === "verified" && "Recovery verified"}
        </h3>
      </div>

      <div className="px-5 py-5">
        {phase === "waiting" ? (
          <p className="text-[14px] leading-relaxed text-muted">
            Approve the recommended rollback to begin recovery verification.
          </p>
        ) : null}

        {phase === "executing" ? (
          <div className="space-y-5">
            <div className="h-0.5 overflow-hidden bg-paper-muted">
              <div className="h-full w-1/3 bg-accent animate-progress" />
            </div>
            <ul className="space-y-3">
              {steps.map((label, index) => {
                const done = index < progressStep;
                const current = index === progressStep;
                return (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-2.5 text-[13.5px]",
                      done || current ? "text-ink" : "text-faint",
                    )}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-healthy" />
                    ) : current ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
                    ) : (
                      <span className="h-3.5 w-3.5 border border-line" />
                    )}
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {phase === "verified" ? (
          <div className="animate-fade-in space-y-5">
            <ul className="space-y-2.5">
              {steps.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2.5 text-[13.5px] text-ink"
                >
                  <Check className="h-3.5 w-3.5 text-healthy" />
                  {label}
                </li>
              ))}
            </ul>

            <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
              <Metric
                label="Error rate"
                value={`${metrics.errorRateBefore}% → ${metrics.errorRateAfter}%`}
              />
              <Metric
                label="Payment success"
                value={`${metrics.paymentSuccessBefore}% → ${metrics.paymentSuccessAfter}%`}
              />
              <Metric label="Service health" value="Healthy" healthy />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  healthy,
}: {
  label: string;
  value: string;
  healthy?: boolean;
}) {
  return (
    <div className="bg-paper px-4 py-3">
      <div className="section-label">{label}</div>
      <div
        className={cn(
          "mono mt-1.5 text-[12.5px]",
          healthy ? "text-healthy" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
