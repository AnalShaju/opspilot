"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, LoaderCircle, Minus, X } from "lucide-react";
import {
  approveIncident,
  cancelResilienceTest,
  fetchResilience,
  fetchResilienceTest,
  startResilienceTest,
} from "@/lib/api/client";
import {
  ACTION_LABELS,
  INCIDENT_TYPE_LABELS,
  formatDateTime,
  formatDuration,
} from "@/lib/format";
import type {
  ResilienceOverallStatus,
  ResilienceScenarioDefinition,
  ResilienceTest,
  StageStatus,
} from "@/lib/types/resilience";
import { cn } from "@/lib/utils";

const RESULT_STYLE: Record<ResilienceOverallStatus, string> = {
  running: "text-accent border-accent/30 bg-accent-soft",
  passed: "text-healthy border-healthy/25 bg-healthy-soft",
  failed: "text-critical border-critical/25 bg-critical-soft",
  cancelled: "text-muted border-line bg-paper-muted",
};

const RESULT_LABEL: Record<ResilienceOverallStatus, string> = {
  running: "RUNNING",
  passed: "PASSED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "passed") {
    return <Check className="h-3.5 w-3.5 text-healthy" strokeWidth={2.5} />;
  }
  if (status === "in_progress") {
    return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />;
  }
  if (status === "failed") {
    return <X className="h-3.5 w-3.5 text-critical" strokeWidth={2.5} />;
  }
  if (status === "skipped") {
    return <Minus className="h-3.5 w-3.5 text-faint" />;
  }
  return <span className="h-3.5 w-3.5 border border-line" />;
}

interface StageRow {
  key: string;
  label: string;
  status: StageStatus;
  detail?: string | null;
}

function buildStages(test: ResilienceTest): StageRow[] {
  return [
    {
      key: "detection",
      label: "Incident detected",
      status: test.detectionStatus,
      detail:
        test.detectionStatus === "passed"
          ? `Detected ${formatDateTime(test.detectedAt)}`
          : null,
    },
    {
      key: "investigation",
      label: "Root cause investigated",
      status: test.investigationStatus,
      detail: test.rootCauseSummary,
    },
    {
      key: "recommendation",
      label: "Fix recommended",
      status: test.recommendationStatus,
      detail:
        test.recommendedActionType && test.recommendedActionTarget
          ? `${ACTION_LABELS[test.recommendedActionType]} · ${test.recommendedActionTarget}`
          : null,
    },
    {
      key: "approval",
      label: "Human approval",
      status: test.approvalStatus,
      detail: test.approvedAt ? `Approved ${formatDateTime(test.approvedAt)}` : null,
    },
    {
      key: "remediation",
      label: "Remediation executed",
      status: test.remediationStatus,
      detail: test.remediationResult,
    },
    {
      key: "verification",
      label: "Recovery verified",
      status: test.verificationStatus,
      detail: test.verificationResult,
    },
  ];
}

export default function ResiliencePage() {
  const [scenarios, setScenarios] = useState<ResilienceScenarioDefinition[]>([]);
  const [tests, setTests] = useState<ResilienceTest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => tests.find((test) => test.testId === selectedId) ?? null,
    [tests, selectedId],
  );
  const anyRunning = tests.some((test) => test.overallStatus === "running");

  const upsert = useCallback((test: ResilienceTest) => {
    setTests((current) => {
      const exists = current.some((item) => item.testId === test.testId);
      return exists
        ? current.map((item) => (item.testId === test.testId ? test : item))
        : [test, ...current];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchResilience();
        if (cancelled) return;
        setScenarios(data.scenarios);
        setTests(data.tests);
        const running = data.tests.find((t) => t.overallStatus === "running");
        setSelectedId((running ?? data.tests[0])?.testId ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tests");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the selected test while it runs. The server derives its state from
  // the real incident workflow; polling never triggers any AI call.
  useEffect(() => {
    if (!selected || selected.overallStatus !== "running") return;
    const id = selected.testId;
    const timer = window.setInterval(() => {
      void fetchResilienceTest(id)
        .then(upsert)
        .catch(() => {
          // transient poll errors are ignored
        });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [selected, upsert]);

  async function handleStart(scenarioId: string) {
    setError(null);
    setStarting(scenarioId);
    try {
      const test = await startResilienceTest(scenarioId);
      upsert(test);
      setSelectedId(test.testId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the test");
    } finally {
      setStarting(null);
    }
  }

  async function handleApprove(test: ResilienceTest) {
    if (!test.incidentId) return;
    setError(null);
    setApproving(true);
    try {
      await approveIncident(test.incidentId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
      void fetchResilienceTest(test.testId).then(upsert).catch(() => {});
    }
  }

  async function handleCancel(test: ResilienceTest) {
    setError(null);
    try {
      upsert(await cancelResilienceTest(test.testId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the test");
    }
  }

  const scenarioName = (test: ResilienceTest) => test.scenarioName;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">Break it on purpose</div>
        <h2 className="display mt-2 text-[36px] text-ink">Resilience Tests</h2>
        <p className="mt-2 text-[15px] text-muted">
          Trigger a controlled failure and watch OpsPilot detect, investigate,
          and recover from it, with you approving the fix.
        </p>
      </header>

      {error ? <p className="text-[13.5px] text-critical">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Loading…
        </div>
      ) : (
        <>
          <section>
            <div className="section-label">Scenarios</div>
            <ul className="mt-3 space-y-3">
              {scenarios.map((scenario) => (
                <li
                  key={scenario.id}
                  className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-ink">
                      {scenario.name}
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {scenario.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={anyRunning || starting !== null}
                    onClick={() => void handleStart(scenario.id)}
                    className="inline-flex items-center gap-2 border border-line px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starting === scenario.id ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
                    ) : null}
                    Start Test
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected ? (
            <section className="panel px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="section-label">Resilience test</div>
                  <h3 className="display mt-1.5 text-[26px] text-ink">
                    {scenarioName(selected)}
                  </h3>
                  <p className="mono mt-1 text-[11px] text-faint">
                    {selected.testId} · started {formatDateTime(selected.startedAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide",
                    RESULT_STYLE[selected.overallStatus],
                  )}
                >
                  {RESULT_LABEL[selected.overallStatus]}
                </span>
              </div>

              <ul className="mt-5 space-y-3">
                {buildStages(selected).map((stage) => (
                  <li key={stage.key} className="flex items-start gap-2.5">
                    <span className="mt-0.5">
                      <StageIcon status={stage.status} />
                    </span>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-[14px]",
                          stage.status === "pending" || stage.status === "skipped"
                            ? "text-faint"
                            : "text-ink",
                        )}
                      >
                        {stage.label}
                      </div>
                      {stage.detail ? (
                        <div className="mt-0.5 text-[13px] text-muted">
                          {stage.detail}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>

              {selected.overallStatus === "running" &&
              selected.approvalStatus === "in_progress" ? (
                <div className="mt-5 space-y-3 border-t border-line pt-5">
                  <div className="flex items-start gap-2 border border-warning/25 bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Human approval required before OpsPilot changes anything.
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={approving}
                      onClick={() => void handleApprove(selected)}
                      className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {approving ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Approve &amp; Fix
                    </button>
                    {selected.incidentId ? (
                      <Link
                        href={`/incidents/${selected.incidentId}`}
                        className="text-[13px] text-accent transition-colors duration-150 hover:text-[#ea580c]"
                      >
                        Review incident
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selected.overallStatus === "running" ? (
                <button
                  type="button"
                  onClick={() => void handleCancel(selected)}
                  className="mt-4 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink"
                >
                  Cancel test
                </button>
              ) : (
                <div className="mt-5 space-y-3 border-t border-line pt-5">
                  <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
                    <div className="bg-paper px-4 py-3.5">
                      <div className="section-label">Recovery time</div>
                      <div className="mono mt-1.5 text-[14px] text-ink">
                        {selected.recoveryDurationMs !== null
                          ? formatDuration(selected.recoveryDurationMs)
                          : "—"}
                      </div>
                    </div>
                    <div className="bg-paper px-4 py-3.5">
                      <div className="section-label">Result</div>
                      <div
                        className={cn(
                          "mono mt-1.5 text-[14px] font-medium",
                          selected.overallStatus === "passed"
                            ? "text-healthy"
                            : selected.overallStatus === "failed"
                              ? "text-critical"
                              : "text-muted",
                        )}
                      >
                        {RESULT_LABEL[selected.overallStatus]}
                      </div>
                    </div>
                  </div>

                  {selected.failureReason ? (
                    <p className="text-[13.5px] text-critical">
                      {selected.failureReason}
                    </p>
                  ) : null}

                  {selected.evaluation.actualActionType ? (
                    <p className="text-[12.5px] text-muted">
                      Graded against expectations. Failure type:{" "}
                      {selected.evaluation.actualIncidentType
                        ? INCIDENT_TYPE_LABELS[
                            selected.evaluation.actualIncidentType
                          ]
                        : "unknown"}{" "}
                      (expected{" "}
                      {INCIDENT_TYPE_LABELS[
                        selected.evaluation.expectedIncidentType
                      ]}
                      ). Fix: {ACTION_LABELS[selected.evaluation.actualActionType]}{" "}
                      (expected{" "}
                      {ACTION_LABELS[selected.evaluation.expectedActionType]}).
                    </p>
                  ) : null}

                  {selected.incidentId ? (
                    <Link
                      href={`/incidents/${selected.incidentId}`}
                      className="inline-block text-[13px] text-accent transition-colors duration-150 hover:text-[#ea580c]"
                    >
                      Open incident
                    </Link>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {tests.length > 1 ? (
            <section>
              <div className="section-label">Recent tests</div>
              <ul className="mt-3 space-y-2">
                {tests.map((test) => (
                  <li key={test.testId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(test.testId)}
                      className={cn(
                        "panel flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-paper-muted",
                        test.testId === selectedId && "bg-accent-soft",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-ink">
                          {test.scenarioName}
                        </span>
                        <span className="mono text-[11px] text-faint">
                          {test.testId} · {formatDateTime(test.startedAt)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="mono text-[12px] text-muted">
                          {test.recoveryDurationMs !== null
                            ? formatDuration(test.recoveryDurationMs)
                            : ""}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide",
                            RESULT_STYLE[test.overallStatus],
                          )}
                        >
                          {RESULT_LABEL[test.overallStatus]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
