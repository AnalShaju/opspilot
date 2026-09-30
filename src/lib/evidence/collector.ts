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
 * Collect all evidence. Critical simulator reads run in parallel for speed
 * (important on Vercel time limits); progress still updates per source.
 */
export async function collectEvidence(options?: {
  sources?: Partial<EvidenceSources>;
  onProgress?: (steps: InvestigationStep[]) => void;
}): Promise<{ evidence: CollectedEvidence; steps: InvestigationStep[] }> {
  const sources = { ...defaultSources, ...options?.sources };
  const steps: InvestigationStep[] = [];
  const report = () => options?.onProgress?.(steps.map((s) => ({ ...s })));

  function start(tool: InvestigationToolName): InvestigationStep {
    const step: InvestigationStep = {
      tool,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    steps.push(step);
    report();
    return step;
  }

  function succeed(step: InvestigationStep, result: unknown) {
    step.status = "completed";
    step.completedAt = new Date().toISOString();
    step.summary = summarize(step.tool, result);
    report();
  }

  function fail(step: InvestigationStep, error: unknown) {
    step.status = "failed";
    step.completedAt = new Date().toISOString();
    step.error = error instanceof Error ? error.message : "Tool call failed";
    report();
  }

  const logStep = start("getLogs");
  const serviceStep = start("getServices");
  const deploymentStep = start("getDeployments");
  const metricsStep = start("getMetrics");

  const [logsResult, servicesResult, deploymentsResult, metricsResult] =
    await Promise.allSettled([
      sources.getLogs(),
      sources.getServices(),
      sources.getDeployments(),
      sources.getMetrics(),
    ]);

  if (logsResult.status === "fulfilled") succeed(logStep, logsResult.value);
  else {
    fail(logStep, logsResult.reason);
    throw logsResult.reason;
  }

  if (servicesResult.status === "fulfilled") {
    succeed(serviceStep, servicesResult.value);
  } else {
    fail(serviceStep, servicesResult.reason);
    throw servicesResult.reason;
  }

  if (deploymentsResult.status === "fulfilled") {
    succeed(deploymentStep, deploymentsResult.value);
  } else {
    fail(deploymentStep, deploymentsResult.reason);
    throw deploymentsResult.reason;
  }

  if (metricsResult.status === "fulfilled") {
    succeed(metricsStep, metricsResult.value);
  } else {
    fail(metricsStep, metricsResult.reason);
    throw metricsResult.reason;
  }

  const healthStep = start("getHealth");
  let health: SimulatorHealth | null = null;
  try {
    health = await sources.getHealth();
    succeed(healthStep, health);
  } catch (error) {
    fail(healthStep, error);
  }

  const previousStep = start("getPreviousIncidents");
  let simulatorIncidents: SimulatorPreviousIncident[] = [];
  try {
    simulatorIncidents = await sources.getPreviousIncidents();
    succeed(previousStep, simulatorIncidents);
  } catch (error) {
    fail(previousStep, error);
  }

  return {
    evidence: {
      services: servicesResult.value,
      logs: logsResult.value,
      metrics: metricsResult.value,
      deployments: deploymentsResult.value,
      health,
      simulatorIncidents,
    },
    steps,
  };
}
