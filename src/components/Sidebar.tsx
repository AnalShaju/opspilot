"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  LayoutDashboard,
  Menu,
  Server,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/services", label: "Services", icon: Server },
  { href: "/reports", label: "Reports", icon: FileText },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-line px-5 py-6">
        <Link
          href="/"
          onClick={onNavigate}
          className="block focus-visible:outline-offset-4"
        >
          <div className="display text-[22px] text-ink">OpsPilot</div>
          <div className="mt-1 text-[12px] text-muted">
            AI Incident Commander
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4" aria-label="Primary">
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-2 text-[13.5px] transition-colors duration-150",
                  active
                    ? "bg-accent-soft text-ink"
                    : "text-ink-soft hover:bg-paper-muted hover:text-ink",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    active ? "text-accent" : "text-faint",
                  )}
                  strokeWidth={1.75}
                />
                <span className="flex-1">{label}</span>
                {active ? (
                  <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-line px-5 py-4">
        <div className="section-label">System status</div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-soft">
          <span
            className="h-1.5 w-1.5 rounded-full bg-healthy animate-pulse-dot"
            aria-hidden
          />
          All systems operational
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center border border-line bg-paper text-ink lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/20"
            aria-label="Close navigation overlay"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[260px] flex-col border-r border-line bg-paper">
            <button
              type="button"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-muted hover:text-ink"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <aside className="hidden h-full w-[240px] shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <NavContent />
      </aside>
    </>
  );
}
