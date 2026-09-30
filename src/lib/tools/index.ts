/**
 * Tool registry.
 *
 * Read tools feed the evidence collector; action tools are only ever invoked by
 * backend code after human approval. DeepSeek never calls any of these.
 */

import { executeRemediation, isAllowedAction } from "@/lib/tools/executeRemediation";
import { getDeployments } from "@/lib/tools/getDeployments";
import { getLogs } from "@/lib/tools/getLogs";
import { getMetrics } from "@/lib/tools/getMetrics";
import { getPreviousIncidents } from "@/lib/tools/getPreviousIncidents";
import { getServices } from "@/lib/tools/getServices";
import {
  DEMO_SCENARIO_ID,
  prepareDemoScenario,
} from "@/lib/tools/prepareSimulatorDemo";
import { recoverDatabase } from "@/lib/tools/recoverDatabase";
import { restartRedis } from "@/lib/tools/restartRedis";
import { rollbackDeployment } from "@/lib/tools/rollbackDeployment";
import {
  resetSimulator,
  simulateScenario,
} from "@/lib/tools/simulatorScenarios";
import { evaluateHealth, verifyHealth } from "@/lib/tools/verifyHealth";
import { ACTION_TYPES, type ActionType } from "@/lib/types/incident";

export {
  DEMO_SCENARIO_ID,
  evaluateHealth,
  executeRemediation,
  getLogs,
  getMetrics,
  getServices,
  getDeployments,
  getPreviousIncidents,
  isAllowedAction,
  prepareDemoScenario,
  recoverDatabase,
  resetSimulator,
  restartRedis,
  rollbackDeployment,
  simulateScenario,
  verifyHealth,
};

/** Read-only tools that collect evidence. */
export const evidenceTools = {
  getLogs,
  getMetrics,
  getServices,
  getDeployments,
  getPreviousIncidents,
  verifyHealth,
} as const;

export type EvidenceToolName = keyof typeof evidenceTools;

/** Only these remediation actions may be executed after human approval. */
export const ALLOWED_ACTIONS: readonly ActionType[] = ACTION_TYPES;
