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
import { recoverDatabase } from "@/lib/tools/recoverDatabase";
import { restartRedis } from "@/lib/tools/restartRedis";
import { rollbackDeployment } from "@/lib/tools/rollbackDeployment";
import {
  resetSimulator,
  simulateScenario,
} from "@/lib/tools/simulatorScenarios";
import { evaluateHealth, verifyHealth } from "@/lib/tools/verifyHealth";

export {
  evaluateHealth,
  executeRemediation,
  getLogs,
  getMetrics,
  getServices,
  getDeployments,
  getPreviousIncidents,
  isAllowedAction,
  recoverDatabase,
  resetSimulator,
  restartRedis,
  rollbackDeployment,
  simulateScenario,
  verifyHealth,
};
