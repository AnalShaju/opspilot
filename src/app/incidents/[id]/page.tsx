"use client";

import { use } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { IncidentDetailClient } from "@/components/IncidentDetailClient";
import { useIncidentWorkspace } from "@/components/useIncidentWorkspace";

export default function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Ensure params promise is tracked for Next.js
  use(params);
  const state = useIncidentWorkspace(params);

  if (state.loading) {
    return (
      <div className="mx-auto flex max-w-xl items-center gap-2 py-20 text-[14px] text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
        Loading incident…
      </div>
    );
  }

  if (state.error || !state.incident) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <h2 className="display text-[28px] text-ink">Incident unavailable</h2>
        <p className="mt-2 text-[14px] text-muted">
          {state.error ?? "Not found"}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex border border-line px-3.5 py-2 text-[13px] text-ink hover:bg-paper-muted"
        >
          Back to overview
        </Link>
      </div>
    );
  }

  return (
    <IncidentDetailClient
      incident={state.incident}
      onIncidentChange={state.setIncident}
    />
  );
}
