"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { bootstrapDemoIncident } from "@/lib/api/client";
import type { Incident } from "@/lib/types/incident";
import { cn } from "@/lib/utils";

const serviceDots = [
  { id: "api", label: "API", failing: false },
  { id: "users", label: "Users", failing: false },
  { id: "orders", label: "Orders", failing: false },
  { id: "payments", label: "Payments", failing: true },
  { id: "database", label: "Database", failing: false },
];

export default function OverviewPage() {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const demo = await bootstrapDemoIncident();
        if (!cancelled) setIncident(demo);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load incident");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 py-20 text-[14px] text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
        Connecting to OpsPilot…
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="mx-auto max-w-3xl py-20">
        <h2 className="display text-[32px] text-ink">Unable to start demo</h2>
        <p className="mt-3 text-[14px] text-muted">{error ?? "Unknown error"}</p>
      </div>
    );
  }

  const isResolved = incident.status === "resolved";

  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-10 py-6 lg:py-12">
      <header>
        <div className="section-label">Production</div>
        <h2 className="display mt-3 text-[40px] text-ink md:text-[48px]">
          {isResolved
            ? `${incident.service} recovered`
            : `${incident.service} is failing`}
        </h2>
        <p className="mt-3 text-[17px] text-muted">{incident.description}</p>
      </header>

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center border px-1.5 py-0.5 text-[10.5px] font-medium",
                isResolved
                  ? "border-healthy/25 bg-healthy-soft text-healthy"
                  : "border-critical/25 bg-critical-soft text-critical",
              )}
            >
              {isResolved ? "Resolved" : "Critical"}
            </span>
            <span className="mono text-[11px] text-faint">{incident.code}</span>
          </div>
          <p className="mt-4 text-[14px] text-ink-soft">
            {isResolved
              ? "OpsPilot completed investigation, remediation, and verification."
              : "OpsPilot detected the failure and is ready to investigate."}
          </p>
        </div>
        <div className="px-6 py-5">
          <Link
            href={`/incidents/${incident.id}`}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
          >
            {isResolved ? "View Incident" : "Investigate Incident"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section>
        <div className="section-label mb-3">Services</div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {serviceDots.map((service) => {
            const failing = service.failing && !isResolved;
            return (
              <span
                key={service.id}
                className="inline-flex items-center gap-2 text-[13px] text-ink-soft"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    failing
                      ? "bg-critical animate-pulse-dot"
                      : "bg-healthy",
                  )}
                  aria-hidden
                />
                <span className={failing ? "text-critical" : undefined}>
                  {service.label}
                </span>
              </span>
            );
          })}
        </div>
      </section>
    </div>
  );
}
