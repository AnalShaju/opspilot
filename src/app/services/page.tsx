import Link from "next/link";
import { services } from "@/data/services";
import { cn } from "@/lib/utils";

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">Fleet health</div>
        <h2 className="display mt-2 text-[36px] text-ink">Services</h2>
        <p className="mt-2 text-[15px] text-muted">
          A quick look at what is healthy and what needs attention.
        </p>
      </header>

      <ul className="panel divide-y divide-line overflow-hidden">
        {services.map((service) => {
          const critical = service.status === "critical";
          const row = (
            <div className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-paper-muted">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    critical
                      ? "bg-critical animate-pulse-dot"
                      : "bg-healthy",
                  )}
                  aria-hidden
                />
                <div>
                  <div className="text-[15px] text-ink">{service.name}</div>
                  {critical ? (
                    <div className="mt-0.5 text-[12.5px] text-critical">
                      Open incident · investigate
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      Healthy
                    </div>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "text-[12.5px]",
                  critical ? "text-critical" : "text-healthy",
                )}
              >
                {critical ? "Failing" : "OK"}
              </span>
            </div>
          );

          if (service.incidentId) {
            return (
              <li key={service.id}>
                <Link href={`/incidents/${service.incidentId}`}>{row}</Link>
              </li>
            );
          }

          return <li key={service.id}>{row}</li>;
        })}
      </ul>
    </div>
  );
}
