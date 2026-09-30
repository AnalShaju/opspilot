import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function DeploymentsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <header>
        <div className="section-label">Deployments</div>
        <h2 className="display mt-2 text-[36px] text-ink">
          Seen inside investigations
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          OpsPilot surfaces deployments when they matter — as evidence during
          an incident investigation.
        </p>
      </header>
      <Link
        href="/incidents"
        className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#ea580c]"
      >
        Open incidents
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
