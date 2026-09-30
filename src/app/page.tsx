import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getActiveIncidents, incidents } from "@/data/incidents";
import { services } from "@/data/services";
import { cn } from "@/lib/utils";

const shortNames: Record<string, string> = {
  "api-gateway": "API",
  users: "Users",
  orders: "Orders",
  payment: "Payments",
  database: "Database",
};

export default function OverviewPage() {
  const active = getActiveIncidents()[0] ?? incidents[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-10 py-6 lg:py-12">
      <header>
        <div className="section-label">Production</div>
        <h2 className="display mt-3 text-[40px] text-ink md:text-[48px]">
          {active.service} is failing
        </h2>
        <p className="mt-3 text-[17px] text-muted">{active.summary}</p>
      </header>

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center border border-critical/25 bg-critical-soft px-1.5 py-0.5 text-[10.5px] font-medium text-critical">
              Critical
            </span>
            <span className="mono text-[11px] text-faint">{active.code}</span>
          </div>
          <p className="mt-4 text-[14px] text-ink-soft">
            OpsPilot detected the failure and is ready to investigate.
          </p>
        </div>
        <div className="px-6 py-5">
          <Link
            href={`/incidents/${active.id}`}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
          >
            Investigate Incident
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section>
        <div className="section-label mb-3">Services</div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {services.map((service) => {
            const critical = service.status === "critical";
            return (
              <Link
                key={service.id}
                href={
                  service.incidentId
                    ? `/incidents/${service.incidentId}`
                    : "/services"
                }
                className="inline-flex items-center gap-2 text-[13px] text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    critical
                      ? "bg-critical animate-pulse-dot"
                      : "bg-healthy",
                  )}
                  aria-hidden
                />
                <span className={critical ? "text-critical" : undefined}>
                  {shortNames[service.id] ?? service.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
