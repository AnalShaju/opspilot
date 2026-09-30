import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-bg text-ink">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
