/**
 * Shapes we expect from the teammate's simulator.
 * Kept loose where the simulator contract is still evolving.
 */

export interface SimulatorLogEntry {
  timestamp?: string;
  level?: string;
  service?: string;
  message: string;
  [key: string]: unknown;
}

export interface SimulatorMetrics {
  errorRate?: number;
  paymentSuccessRate?: number;
  latencyMs?: number;
  [key: string]: unknown;
}

export interface SimulatorService {
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface SimulatorDeployment {
  version: string;
  service?: string;
  deployedAt?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SimulatorPreviousIncident {
  id?: string;
  title?: string;
  service?: string;
  severity?: string;
  /** "open" for the currently active incident, otherwise "resolved". */
  status?: string;
  scenario?: string;
  rootCause?: string;
  resolution?: string;
  [key: string]: unknown;
}

export interface SimulatorHealth {
  status?: string;
  paymentService?: string;
  errorRate?: number;
  paymentSuccessRate?: number;
  recovered?: boolean;
  recoveryStatus?: string;
  /** Scenario currently applied; null/undefined when baseline is healthy. */
  activeScenario?: string | null;
  /** Per-service health, e.g. { "Redis": "unhealthy" }. */
  services?: Record<string, string>;
  [key: string]: unknown;
}

/** Response of every remediation action (rollback / restart / recover). */
export interface SimulatorActionResult {
  success: boolean;
  message?: string;
  action?: string;
  version?: string;
  service?: string;
  [key: string]: unknown;
}

/** @deprecated use SimulatorActionResult */
export type SimulatorRollbackResult = SimulatorActionResult;

export interface SimulatorScenarioResult {
  success: boolean;
  scenarioId?: string;
  message?: string;
  incidentId?: string;
  [key: string]: unknown;
}

export class SimulatorError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 502, details?: unknown) {
    super(message);
    this.name = "SimulatorError";
    this.status = status;
    this.details = details;
  }
}
