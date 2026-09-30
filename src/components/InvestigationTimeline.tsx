"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StoryStep {
  id: string;
  label: string;
}

export function InvestigationTimeline({
  steps,
  animate = true,
}: {
  steps: StoryStep[];
  animate?: boolean;
}) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!animate) return;

    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      setRevealed(count);
      if (count >= steps.length) window.clearInterval(id);
    }, 220);

    return () => window.clearInterval(id);
  }, [animate, steps.length]);

  const visibleCount = animate ? revealed : steps.length;

  return (
    <ul className="space-y-3">
      {steps.map((step, index) => {
        const shown = index < visibleCount;
        return (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-3 transition-opacity duration-300",
              shown ? "opacity-100" : "opacity-25",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center border",
                shown
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line bg-paper-muted text-faint",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span className="text-[14px] text-ink">{step.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
