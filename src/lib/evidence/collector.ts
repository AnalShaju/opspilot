/**
 * Evidence collector.
 *
 * Gathers ALL current evidence from the simulator up front, so the single
 * DeepSeek call gets everything at once and never needs tools.
 * Progress is reported per source so the UI checklist can tick along.
 */

import {
  getDeployments,
  getLogs,
  getMetrics,
  getPreviousIncidents,
  getServices,
  verifyHealth,
} from "@/lib/tools";
import type {
  InvestigationStep,
  InvestigationToolName,
} from "@/lib/types/agent";
import type {
  SimulatorDeployment,
  SimulatorHealth,
  SimulatorLogEntry,
  SimulatorMetrics,
  SimulatorPreviousIncident,
  SimulatorService,
} from "@/lib/types/simulator";

export interface CollectedEvidence {
  services: SimulatorService[];
  logs: SimulatorLogEntry[];
  metrics: SimulatorMetrics;
  deployments: SimulatorDeployment[];
  health: SimulatorHealth | null;
  /** The simulator's own incident log (includes the currently open incident). */
  simulatorIncidents: SimulatorPreviousIncident[];
}

export interface EvidenceSources {
  getServices: () => Promise<SimulatorService[]>;
  getLogs: () => Promise<SimulatorLogEntry[]>;
  getMetrics: () => Promise<SimulatorMetrics>;
  getDeployments: () => Promise<SimulatorDeployment[]>;
  getHealth: () => Promise<SimulatorHealth>;
  getPreviousIncidents: () => Promise<SimulatorPreviousIncident[]>;
}

const defaultSources: EvidenceSources = {
  getServices,
  getLogs,
  getMetrics,
  getDeployments,
  getHealth: verifyHealth,
  getPreviousIncidents,
};

function summarize(tool: InvestigationToolName, result: unknown): string {
  if (Array.isArray(result)) {
    const noun: Partial<Record<InvestigationToolName, string>> = {
      getServices: "services checked",
      getLogs: "log lines",
      getDeployments: "deployments",
      getPreviousIncidents: "simulator incidents",
    };
    return `${result.length} ${noun[tool] ?? "items"}`;
  }
  if (tool === "getMetrics") return "metrics retrieved";
  if (tool === "getHealth") return "current health retrieved";
  return "completed";
}

/**
 * Collect all evidence sequentially (fixed order, readable progress).
 * - Core sources (services/logs/metrics/deployments) must succeed, otherwise
 *   the investigation fails with a clear simulator error.
 * - Health and the simulator incident log degrade gracefully.
 */
export async function collectEvidence(options?: {
  sources?: Partial<EvidenceSources>;
  onProgress?: (steps: InvestigationStep[]) => void;
}): Promise<{ evidence: CollectedEvidence; steps: InvestigationStep[] }> {
  const sources = { ...defaultSources, ...options?.sources };
  const steps: InvestigationStep[] = [];
  const report = () => options?.onProgress?.(steps.map((s) => ({ ...s })));

  async function run<T>(
    tool: InvestigationToolName,
    fn: () => Promise<T>,
    critical: boolean,
  ): Promise<T | null> {
    const step: InvestigationStep = {
      tool,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    steps.push(step);
    report();

    try {
      const result = await fn();
      step.status = "completed";
      step.completedAt = new Date().toISOString();
      step.summary = summarize(tool, result);
      report();
      return result;
    } catch (error) {
      step.status = "failed";
      step.completedAt = new Date().toISOString();
      step.error = error instanceof Error ? error.message : "Tool call failed";
      report();
      if (critical) throw error;
      return null;
    }
  }

  const logs = (await run("getLogs", sources.getLogs, true)) ?? [];
  const services = (await run("getServices", sources.getServices, true)) ?? [];
  const deployments =
    (await run("getDeployments", sources.getDeployments, true)) ?? [];
  const metrics = (await run("getMetrics", sources.getMetrics, true)) ?? {};
  const health = await run("getHealth", sources.getHealth, false);
  const simulatorIncidents =
    (await run("getPreviousIncidents", sources.getPreviousIncidents, false)) ??
    [];

  return {
    evidence: { services, logs, metrics, deployments, health, simulatorIncidents },
    steps,
  };
}
