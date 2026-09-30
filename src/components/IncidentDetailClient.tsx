"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import {
  approveIncident,
  fetchIncident,
  investigateIncident,
} from "@/lib/api/client";
import type { Incident } from "@/lib/types/incident";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  getLogs: "Application logs checked",
  getServices: "Service health checked",
  getDeployments: "Recent deployments checked",
  getMetrics: "Metrics checked",
  getPreviousIncidents: "Previous incidents checked",
  getIncidentHistory: "Past resolved incidents reviewed",
};

const RECOVERY_STEP_COUNT = 3;

function recoveryStepLabels(incident: Incident): string[] {
  switch (incident.recommendedAction?.type) {
    case "restart_redis":
      return [
        "Redis restarted",
        `${incident.service} recovering`,
        "Recovery verified",
      ];
    case "recover_database":
      return [
        "Connection pool recovered",
        `${incident.service} recovering`,
        "Recovery verified",
      ];
    default:
      return [
        "Deployment rolled back",
        `${incident.service} restarted`,
        "Recovery verified",
      ];
  }
}

function describeFix(action: NonNullable<Incident["recommendedAction"]>): string {
  switch (action.type) {
    case "restart_redis":
      return "Restart Redis";
    case "recover_database":
      return "Recover the database connection pool";
    default:
      return `Rollback ${action.service ?? "deployment"} ${action.target}`;
  }
}

function describeExecuting(
  action: Incident["recommendedAction"] | undefined,
): string {
  switch (action?.type) {
    case "restart_redis":
      return "Restarting Redis…";
    case "recover_database":
      return "Recovering the database…";
    default:
      return "Executing rollback…";
  }
}

type UiPhase =
  | "ready"
  | "investigating"
  | "awaiting_approval"
  | "remediating"
  | "resolved"
  | "failed";

function mapStatus(status: Incident["status"]): UiPhase {
  if (status === "investigating") return "investigating";
  if (status === "awaiting_approval") return "awaiting_approval";
  if (status === "remediating" || status === "verifying") return "remediating";
  if (status === "resolved") return "resolved";
  if (status === "failed" || status === "investigation_failed") return "failed";
  return "ready";
}

export function IncidentDetailClient({
  incident: initial,
  onIncidentChange,
}: {
  incident: Incident;
  onIncidentChange: (incident: Incident) => void;
}) {
  const [incident, setIncident] = useState(initial);
  const [phase, setPhase] = useState<UiPhase>(mapStatus(initial.status));
  const [error, setError] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [progressStep, setProgressStep] = useState(
    initial.status === "resolved" ? RECOVERY_STEP_COUNT : -1,
  );

  function sync(next: Incident) {
    setIncident(next);
    onIncidentChange(next);
    setPhase(mapStatus(next.status));
  }

  // Auto-start investigation for new/detected incidents.
  // Shared in-flight promise avoids React Strict Mode double-calls.
  useEffect(() => {
    const shouldInvestigate =
      incident.status === "detected" ||
      incident.status === "investigation_failed";

    if (!shouldInvestigate) return;

    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setPhase("investigating");
      setError(null);
    });

    const poll = window.setInterval(() => {
      void fetchIncident(incident.id)
        .then((latest) => {
          if (cancelled) return;
          setIncident(latest);
          onIncidentChange(latest);
          if (
            latest.status === "awaiting_approval" ||
            latest.status === "investigation_failed" ||
            latest.status === "resolved"
          ) {
            setPhase(mapStatus(latest.status));
          }
        })
        .catch(() => {
          // ignore transient poll errors
        });
    }, 800);

    void investigateIncident(incident.id)
      .then((next) => {
        if (!cancelled) sync(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Investigation failed");
        setPhase("failed");
        void fetchIncident(incident.id)
          .then((latest) => {
            if (!cancelled) sync(latest);
          })
          .catch(() => {
            // ignore
          });
      })
      .finally(() => {
        window.clearInterval(poll);
      });

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
    // Only re-run when switching incidents. Status updates from polling
    // must not cancel the in-flight DeepSeek request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident.id]);

  const steps = useMemo(
    () => incident.investigation?.steps ?? [],
    [incident.investigation?.steps],
  );
  const completedTools = useMemo(
    () =>
      new Set(steps.filter((s) => s.status === "completed").map((s) => s.tool)),
    [steps],
  );

  const displayChecks = useMemo(() => {
    const order = [
      "getLogs",
      "getServices",
      "getDeployments",
      "getMetrics",
      "getPreviousIncidents",
      "getIncidentHistory",
    ] as const;

    type CheckItem = {
      key: string;
      label: string;
      done: boolean;
      running: boolean;
    };

    const used = order.filter((tool) =>
      steps.some((step) => step.tool === tool),
    );

    if (used.length === 0 && phase === "investigating") {
      return [
        {
          key: "waiting",
          label: "OpsPilot is investigating…",
          done: false,
          running: true,
        },
      ] satisfies CheckItem[];
    }

    const list: CheckItem[] = (used.length ? used : order.slice(0, 4)).map(
      (tool) => ({
        key: tool,
        label: TOOL_LABELS[tool] ?? tool,
        done: completedTools.has(tool),
        running: steps.some((s) => s.tool === tool && s.status === "running"),
      }),
    );

    if (
      phase === "awaiting_approval" ||
      phase === "resolved" ||
      phase === "remediating"
    ) {
      list.push({
        key: "compared",
        label: "Evidence compared",
        done: true,
        running: false,
      });
    }

    return list;
  }, [steps, completedTools, phase]);

  async function handleApprove() {
    if (phase !== "awaiting_approval") return;
    setPhase("remediating");
    setProgressStep(0);
    setError(null);

    try {
      setProgressStep(1);
      const next = await approveIncident(incident.id, true);
      setProgressStep(3);
      sync(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remediation failed");
      setPhase("failed");
    }
  }

  const confidencePct = incident.rootCause
    ? Math.round(incident.rootCause.confidence * 100)
    : null;

  const evidenceItems = buildEvidenceItems(incident);

  return (
    <>
      <div className="mx-auto max-w-xl space-y-0 py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </Link>

        <header className="mt-5 border-b border-line pb-6">
          <h2 className="display text-[36px] text-ink md:text-[40px]">
            {incident.service}
          </h2>
          <p className="mt-2 text-[16px] text-muted">{incident.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center border px-1.5 py-0.5 text-[10.5px] font-medium",
                phase === "resolved"
                  ? "border-healthy/25 bg-healthy-soft text-healthy"
                  : "border-critical/25 bg-critical-soft text-critical",
              )}
            >
              {phase === "resolved"
                ? "Resolved"
                : incident.severity.charAt(0).toUpperCase() +
                  incident.severity.slice(1)}
            </span>
            {incident.errorRate !== undefined ? (
              <span className="mono text-[13px] text-ink-soft">
                Error rate:{" "}
                <span
                  className={
                    phase === "resolved" ? "text-healthy" : "text-critical"
                  }
                >
                  {phase === "resolved"
                    ? `${incident.recovery?.errorRate ?? 1}%`
                    : `${incident.errorRate}%`}
                </span>
              </span>
            ) : null}
          </div>
        </header>

        <section className="border-b border-line py-6">
          <div className="section-label">OpsPilot Investigation</div>
          {phase === "investigating" ? (
            <p className="mt-3 text-[14px] text-ink-soft">
              OpsPilot is investigating…
            </p>
          ) : null}
          <ul className="mt-4 space-y-2.5">
            {displayChecks.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-2.5 text-[14px]",
                  item.done ? "text-ink" : "text-faint",
                )}
              >
                {item.done ? (
                  <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                ) : item.running || phase === "investigating" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <span className="h-3.5 w-3.5 border border-line" />
                )}
                {item.label}
              </li>
            ))}
          </ul>
          {(phase === "awaiting_approval" ||
            phase === "resolved" ||
            phase === "remediating") && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">
                {Object.keys(incident.investigation?.evidence?.bag ?? {})
                  .length || completedTools.size}{" "}
                sources checked
              </span>
              <button
                type="button"
                onClick={() => setEvidenceOpen(true)}
                className="inline-flex items-center gap-1 text-[13px] text-accent transition-colors duration-150 hover:text-[#ea580c]"
              >
                View evidence
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {(incident.investigation?.historyRecordIds?.length ?? 0) > 0 ? (
            <p className="mt-3 text-[12.5px] text-muted">
              Considered {incident.investigation?.historyRecordIds?.length}{" "}
              similar past incident
              {incident.investigation?.historyRecordIds?.length === 1
                ? ""
                : "s"}{" "}
              as context. Current evidence decides.
            </p>
          ) : null}
        </section>

        {incident.rootCause &&
        (phase === "awaiting_approval" ||
          phase === "remediating" ||
          phase === "resolved") ? (
          <section className="border-b border-line py-6">
            <div className="section-label">Likely Cause</div>
            <h3 className="display mt-2 text-[28px] text-ink">
              {incident.rootCause.summary}
            </h3>
            {confidencePct !== null ? (
              <>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-muted">Confidence</span>
                  <span className="mono text-[13px] font-medium text-accent">
                    {confidencePct}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden bg-paper-muted">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </>
            ) : null}
            <ul className="mt-4 space-y-1.5">
              {(incident.rootCause.evidence ?? []).map((item) => (
                <li key={item} className="text-[14px] text-ink-soft">
                  — {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="py-6">
          {phase === "awaiting_approval" && incident.recommendedAction ? (
            <>
              <div className="section-label">Recommended Fix</div>
              <h3 className="display mt-2 text-[26px] text-ink">
                {describeFix(incident.recommendedAction)}
              </h3>
              <p className="mt-2 text-[13px] text-muted">
                Risk:{" "}
                {incident.recommendedAction.risk.charAt(0).toUpperCase() +
                  incident.recommendedAction.risk.slice(1)}
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
                {incident.recommendedAction.reason}
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

          {phase === "remediating" ? (
            <div className="animate-fade-in space-y-4">
              <div className="section-label">Recovery</div>
              <div className="flex items-center gap-2 text-[16px] text-ink">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                {describeExecuting(incident.recommendedAction)}
              </div>
              <div className="h-0.5 overflow-hidden bg-paper-muted">
                <div className="h-full w-1/3 bg-accent animate-progress" />
              </div>
              <ul className="space-y-2.5">
                {recoveryStepLabels(incident).map((label, index) => {
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

          {phase === "resolved" ? (
            <div className="animate-fade-in space-y-5">
              <div className="flex items-center gap-2 text-healthy">
                <CheckCircle2 className="h-5 w-5" />
                <div className="section-label !text-healthy">
                  Incident Resolved
                </div>
              </div>
              <h3 className="display text-[28px] text-ink">
                {incident.service} is healthy
              </h3>
              {incident.errorRate !== undefined ? (
                <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
                  <div className="bg-paper px-4 py-3.5">
                    <div className="section-label">Error rate</div>
                    <div className="mono mt-1.5 text-[14px] text-ink">
                      {incident.errorRate}% → {incident.recovery?.errorRate ?? 1}%
                    </div>
                  </div>
                  {incident.recovery?.paymentSuccessRate !== undefined ? (
                    <div className="bg-paper px-4 py-3.5">
                      <div className="section-label">Payment success</div>
                      <div className="mono mt-1.5 text-[14px] text-ink">
                        {incident.recovery.paymentSuccessRate}%
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : incident.recovery?.result ? (
                <p className="text-[14px] text-ink-soft">
                  {incident.recovery.result}
                </p>
              ) : null}
              <p className="text-[14px] text-healthy">Recovery verified</p>
              <Link
                href={`/reports/${incident.id}`}
                className="inline-flex border border-line px-3.5 py-2.5 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted"
              >
                View Incident Report
              </Link>
            </div>
          ) : null}

          {phase === "failed" ? (
            <div className="space-y-3">
              <div className="section-label">
                {incident.status === "failed" ||
                incident.recovery?.executed === false ||
                (error ?? "").toLowerCase().includes("rollback")
                  ? "Remediation issue"
                  : "Investigation issue"}
              </div>
              <p className="text-[14px] text-critical">
                {error ??
                  incident.recovery?.result ??
                  incident.investigation?.error ??
                  "OpsPilot could not complete this step."}
              </p>
              <button
                type="button"
                onClick={async () => {
                  setPhase("investigating");
                  setError(null);
                  try {
                    const next = await investigateIncident(incident.id);
                    sync(next);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Investigation failed",
                    );
                    setPhase("failed");
                  }
                }}
                className="border border-line px-3.5 py-2 text-[13px] text-ink hover:bg-paper-muted"
              >
                Retry investigation
              </button>
            </div>
          ) : null}

          {error && phase !== "failed" ? (
            <p className="mt-4 text-[13px] text-critical">{error}</p>
          ) : null}
        </section>
      </div>

      <EvidenceDrawer
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        evidence={evidenceItems}
      />
    </>
  );
}

function buildEvidenceItems(incident: Incident): Array<{
  id: string;
  title: string;
  summary: string;
}> {
  const bag = incident.investigation?.evidence?.bag ?? {};
  const items: Array<{ id: string; title: string; summary: string }> = [];

  if (bag.getLogs) {
    items.push({
      id: "e1",
      title: "Application Logs",
      summary: summarizeUnknown(bag.getLogs),
    });
  }
  if (bag.getMetrics) {
    items.push({
      id: "e2",
      title: "Metrics",
      summary: summarizeUnknown(bag.getMetrics),
    });
  }
  if (bag.getDeployments) {
    items.push({
      id: "e3",
      title: "Recent Deployment",
      summary: summarizeUnknown(bag.getDeployments),
    });
  }
  if (bag.getServices) {
    items.push({
      id: "e4",
      title: "Service Health",
      summary: summarizeUnknown(bag.getServices),
    });
  }
  if (bag.getPreviousIncidents) {
    items.push({
      id: "e5",
      title: "Previous Incidents",
      summary: summarizeUnknown(bag.getPreviousIncidents),
    });
  }
  if (Array.isArray(bag.getIncidentHistory) && bag.getIncidentHistory.length) {
    items.push({
      id: "e6",
      title: "Learned From History",
      summary: `${bag.getIncidentHistory.length} similar resolved incident${bag.getIncidentHistory.length === 1 ? "" : "s"} (context only)`,
    });
  }

  return items;
}

function summarizeUnknown(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "No items";
    const first = value[0];
    if (first && typeof first === "object") {
      const record = first as Record<string, unknown>;
      if (typeof record.message === "string") return record.message;
      if (typeof record.version === "string") {
        return `${record.version}${typeof record.service === "string" ? ` · ${record.service}` : ""}`;
      }
      if (typeof record.name === "string" && typeof record.status === "string") {
        return `${value.length} services (e.g. ${record.name}: ${record.status})`;
      }
    }
    return `${value.length} items`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.errorRate === "number") {
      return `Error rate ${record.errorRate}%`;
    }
    return JSON.stringify(record).slice(0, 120);
  }
  return String(value);
}
