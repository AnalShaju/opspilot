"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { EvidenceItem } from "@/data/types";

const compactLines: Record<string, string> = {
  e1: "Payment DB connection timeout",
  e2: "Error rate 2% → 82%",
  e3: "v1.8.4 · Payment Service",
  e4: "Payment unhealthy · Database healthy · Provider healthy",
  e5: "Similar deployment rollback resolved the issue",
};

export function EvidenceDrawer({
  open,
  onClose,
  evidence,
}: {
  open: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/25"
        aria-label="Close evidence"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-none animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Evidence"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="section-label">Evidence</div>
            <h2 className="mt-1 text-[15px] font-medium text-ink">
              What OpsPilot checked
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-muted transition-colors duration-150 hover:bg-paper-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-line">
          {evidence.map((item) => (
            <li key={item.id} className="px-5 py-4">
              <div className="text-[13px] font-medium text-ink">{item.title}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-muted">
                {compactLines[item.id] ?? item.summary}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
