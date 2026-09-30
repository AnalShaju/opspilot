"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { syncIncidents } from "@/lib/api/client";
import type { Incident } from "@/lib/types/incident";
import { cn } from "@/lib/utils";

const serviceDots = [
  { id: "api", label: "API", match: "API Gateway" },
  { id: "users", label: "Users", match: "Users Service" },
  { id: "orders", label: "Orders", match: "Orders Service" },
  { id: "payments", label: "Payments", match: "Payment Service" },
  { id: "database", label: "Database", match: "Database" },
  { id: "redis", label: "Redis", match: "Redis" },
];

function failingDot(incident: Incident, match: string): boolean {
  if (incident.service === match) return true;
  if (match === "Redis" && incident.service === "Orders Service") return true;
  return false;
}

export default function OverviewPage() {
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const synced = await syncIncidents();
        if (!cancelled) {
          setActiveIncidents(
            synced.activeIncidents ??
              (synced.incident ? [synced.incident] : []),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load incidents");
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
        Syncing incidents from the simulator…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl py-20">
        <h2 className="display text-[32px] text-ink">Unable to sync incidents</h2>
        <p className="mt-3 text-[14px] text-muted">{error}</p>
      </div>
    );
  }

  if (activeIncidents.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col justify-center gap-8 py-6 lg:py-12">
        <header>
          <div className="section-label">Production</div>
          <h2 className="display mt-3 text-[40px] text-ink md:text-[48px]">
            No active incidents
          </h2>
          <p className="mt-3 text-[17px] text-muted">
            Trigger a failure in the simulator or start a Resilience Test. OpsPilot
            will sync whatever the simulator reports — any service, not just
            payments.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/resilience"
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
          >
            Open Resilience Tests
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/incidents"
            className="inline-flex items-center gap-2 border border-line bg-paper px-4 py-2.5 text-[14px] font-medium text-ink transition-colors duration-150 hover:bg-paper-muted"
          >
            View incident history
          </Link>
        </div>
      </div>
    );
  }

  const failingServices = new Set(
    serviceDots
      .filter((service) =>
        activeIncidents.some((incident) => failingDot(incident, service.match)),
      )
      .map((service) => service.id),
  );

  const headline =
    activeIncidents.length === 1
      ? `${activeIncidents[0].service} is failing`
      : `${activeIncidents.length} services are failing`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-10 py-6 lg:py-12">
      <header>
        <div className="section-label">Production</div>
        <h2 className="display mt-3 text-[40px] text-ink md:text-[48px]">
          {headline}
        </h2>
        <p className="mt-3 text-[17px] text-muted">
          {activeIncidents.length === 1
            ? activeIncidents[0].description
            : "Select an incident to investigate. Each investigation stays on that incident id through approval and remediation."}
        </p>
      </header>

      <section className="space-y-3">
        <div className="section-label">Active incidents</div>
        <ul className="space-y-3">
          {activeIncidents.map((incident) => (
            <li key={incident.id}>
              <div className="panel overflow-hidden">
                <div className="border-b border-line px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center border border-critical/25 bg-critical-soft px-1.5 py-0.5 text-[10.5px] font-medium text-critical">
                      Critical
                    </span>
                    <StatusBadge status={incident.severity} />
                    <span className="mono text-[11px] text-faint">
                      {incident.code}
                    </span>
                  </div>
                  <div className="mt-3 text-[18px] font-medium text-ink">
                    {incident.service}
                  </div>
                  <p className="mt-1 text-[14px] text-ink-soft">
                    {incident.title}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    {incident.description}
                  </p>
                </div>
                <div className="px-6 py-5">
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
                  >
                    Investigate Incident
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="section-label mb-3">Services</div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {serviceDots.map((service) => {
            const failing = failingServices.has(service.id);
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
