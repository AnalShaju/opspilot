import Link from "next/link";
import { reports } from "@/data/reports";

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <div className="section-label">What happened</div>
        <h2 className="display mt-2 text-[36px] text-ink">Reports</h2>
        <p className="mt-2 text-[15px] text-muted">
          Short summaries of incidents OpsPilot investigated and resolved.
        </p>
      </header>

      <ul className="space-y-3">
        {reports.map((report) => (
          <li key={report.id}>
            <Link
              href={`/reports/${report.id}`}
              className="panel block px-5 py-5 transition-colors duration-150 hover:bg-paper-muted"
            >
              <div className="mono text-[11px] text-faint">
                {report.incidentCode}
              </div>
              <div className="display mt-2 text-[24px] text-ink">
                {report.title}
              </div>
              <div className="mt-2 text-[13.5px] text-muted">
                Cause: {report.rootCause} · Recovered in {report.recoveryTime}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
