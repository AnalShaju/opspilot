"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EvidenceItem } from "@/data/types";
import { EvidenceCard } from "@/components/EvidenceCard";

export function EvidenceDisclosure({ evidence }: { evidence: EvidenceItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-paper-muted"
        aria-expanded={open}
      >
        <div>
          <div className="section-label">Evidence</div>
          <div className="mt-1 text-[14px] text-ink">
            {evidence.length} sources checked
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-accent">
          {open ? "Hide" : "View Evidence"}
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {open ? (
        <div className="animate-fade-in border-t border-line px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {evidence.map((item) => (
              <EvidenceCard key={item.id} evidence={item} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
