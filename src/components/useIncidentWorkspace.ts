"use client";

import { use, useEffect, useState } from "react";
import type { Incident } from "@/lib/types/incident";
import { fetchIncident } from "@/lib/api/client";

export function useIncidentWorkspace(paramsPromise: Promise<{ id: string }>) {
  const { id } = use(paramsPromise);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchIncident(id);
        if (!cancelled) setIncident(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { incident, setIncident, loading, error, id };
}
