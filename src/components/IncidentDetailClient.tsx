"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import type { Incident, IncidentReport as ReportType } from "@/data/types";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "done";

const checks = [
  "Application logs checked",
  "Service health checked",
  "Recent deployments checked",
  "Evidence compared",
];

const recoverySteps = [
  "Deployment rolled back",
  "Payment service restarted",
  "Recovery verified",
];

export function IncidentDetailClient({
  incident,
  report,
}: {
  incident: Incident;
  report: ReportType;
}) {
  const [phase, setPhase] = useState<Phase>(
    incident.status === "resolved" ? "done" : "idle",
  );
  const [progressStep, setProgressStep] = useState(
    incident.status === "resolved" ? recoverySteps.length : -1,
  );
  const [checksShown, setChecksShown] = useState(
    incident.status === "resolved" ? checks.length : 0,
  );
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  useEffect(() => {
    if (incident.status === "resolved") return;
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      setChecksShown(count);
      if (count >= checks.length) window.clearInterval(id);
    }, 180);
    return () => window.clearInterval(id);
  }, [incident.status]);

  async function handleApprove() {
    if (phase !== "idle") return;
    setPhase("running");
    setProgressStep(0);
    await wait(650);
    setProgressStep(1);
    await wait(650);
    setProgressStep(2);
    await wait(500);
    setProgressStep(3);
    setPhase("done");
  }

  return (
    <>
      <div className="mx-auto max-w-xl space-y-0 py-2">
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to incidents
        </Link>

        {/* Header */}
        <header className="mt-5 border-b border-line pb-6">
          <h2 className="display text-[36px] text-ink md:text-[40px]">
            {incident.service}
          </h2>
          <p className="mt-2 text-[16px] text-muted">500 errors detected</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center border border-critical/25 bg-critical-soft px-1.5 py-0.5 text-[10.5px] font-medium text-critical">
              Critical
            </span>
            <span className="mono text-[13px] text-ink-soft">
              Error rate:{" "}
              <span className="text-critical">
                {phase === "done"
                  ? `${incident.recovery.errorRateAfter}%`
                  : `${incident.errorRate}%`}
              </span>
            </span>
          </div>
        </header>

        {/* Investigation */}
        <section className="border-b border-line py-6">
          <div className="section-label">OpsPilot Investigation</div>
          <ul className="mt-4 space-y-2.5">
            {checks.map((label, index) => {
              const shown = index < checksShown;
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-2.5 text-[14px] transition-opacity duration-300",
                    shown ? "opacity-100 text-ink" : "opacity-25 text-faint",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5",
                      shown ? "text-accent" : "text-faint",
                    )}
                    strokeWidth={2.5}
                  />
                  {label}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">3 sources checked</span>
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="inline-flex items-center gap-1 text-[13px] text-accent transition-colors duration-150 hover:text-[#ea580c]"
            >
              View evidence
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* Likely cause */}
        <section className="border-b border-line py-6">
          <div className="section-label">Likely Cause</div>
          <h3 className="display mt-2 text-[28px] text-ink">
            Deployment v1.8.4
          </h3>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Confidence</span>
            <span className="mono text-[13px] font-medium text-accent">92%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden bg-paper-muted">
            <div className="h-full w-[92%] bg-accent" />
          </div>
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">
            Payment errors began shortly after deployment v1.8.4 while the
            database and payment provider remained healthy.
          </p>
        </section>

        {/* Fix / Recovery / Resolved — one evolving block */}
        <section className="py-6">
          {phase === "idle" ? (
            <>
              <div className="section-label">Recommended Fix</div>
              <h3 className="display mt-2 text-[26px] text-ink">
                Rollback deployment v1.8.4
              </h3>
              <p className="mt-2 text-[13px] text-muted">Risk: Medium</p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
                Rollback is reversible and is expected to restore the previous
                stable version.
              </p>
              <div className="mt-5 flex items-start gap-2 border border-warning/25 bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Human approval required
              </div>
              <button
                type="button"
                onClick={handleApprove}
                className="mt-5 w-full bg-accent px-4 py-3 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c] sm:w-auto"
              >
                Approve &amp; Fix
              </button>
            </>
          ) : null}

          {phase === "running" ? (
            <div className="animate-fade-in space-y-4">
              <div className="section-label">Recovery</div>
              <div className="flex items-center gap-2 text-[16px] text-ink">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                Executing rollback…
              </div>
              <div className="h-0.5 overflow-hidden bg-paper-muted">
                <div className="h-full w-1/3 bg-accent animate-progress" />
              </div>
              <ul className="space-y-2.5">
                {recoverySteps.map((label, index) => {
                  const done = index < progressStep;
                  const current = index === progressStep;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2.5 text-[14px]",
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

          {phase === "done" ? (
            <div className="animate-fade-in space-y-5">
              <div className="flex items-center gap-2 text-healthy">
                <CheckCircle2 className="h-5 w-5" />
                <div className="section-label !text-healthy">
                  Incident Resolved
                </div>
              </div>
              <h3 className="display text-[28px] text-ink">
                Payment Service is healthy
              </h3>

              <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
                <div className="bg-paper px-4 py-3.5">
                  <div className="section-label">Error rate</div>
                  <div className="mono mt-1.5 text-[14px] text-ink">
                    {incident.recovery.errorRateBefore}% →{" "}
                    {incident.recovery.errorRateAfter}%
                  </div>
                </div>
                <div className="bg-paper px-4 py-3.5">
                  <div className="section-label">Payment success</div>
                  <div className="mono mt-1.5 text-[14px] text-ink">
                    {incident.recovery.paymentSuccessBefore}% →{" "}
                    {incident.recovery.paymentSuccessAfter}%
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-healthy">Recovery verified</p>

              <Link
                href={`/reports/${report.id}`}
                className="inline-flex border border-line px-3.5 py-2.5 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted"
              >
                View Incident Report
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <EvidenceDrawer
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        evidence={incident.evidence}
      />
    </>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
