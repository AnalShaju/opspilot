"use client";

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
    <header className="flex h-12 shrink-0 items-center border-b border-line bg-paper/80 px-4 pl-14 backdrop-blur-[2px] lg:px-8 lg:pl-8">
      <h1 className="text-[13px] font-medium text-ink">{title}</h1>
    </header>
  );
}
