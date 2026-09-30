"use client";

import { Bell, Search } from "lucide-react";
import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/": "Overview",
  "/incidents": "Incidents",
  "/services": "Services",
  "/reports": "Reports",
};

function resolveTitle(pathname: string): string {
  if (pathname.startsWith("/incidents/")) return "Investigation";
  if (pathname.startsWith("/reports/")) return "Report";
  if (pathname.startsWith("/deployments")) return "Deployments";
  return titles[pathname] ?? "OpsPilot";
}

export function Topbar() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-paper/80 px-4 pl-14 backdrop-blur-[2px] lg:px-8 lg:pl-8">
      <h1 className="text-[13px] font-medium text-ink">{title}</h1>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center text-muted transition-colors duration-150 hover:bg-paper-muted hover:text-ink"
          aria-label="Search"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center text-muted transition-colors duration-150 hover:bg-paper-muted hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-critical" />
        </button>
        <div
          className="ml-2 flex h-7 w-7 items-center justify-center border border-line bg-paper-muted text-[11px] font-medium text-ink-soft"
          title="On-call engineer"
          aria-label="User avatar"
        >
          AS
        </div>
      </div>
    </header>
  );
}
