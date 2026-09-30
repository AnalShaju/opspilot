/**
 * Resilience test scenarios = the simulator's public scenario ids.
 *
 * `expected*` fields are used ONLY to grade a finished run. They are never
 * sent to the investigation, and OpsPilot does not assume them anywhere in
 * detection or diagnosis.
 */

import {
  RESILIENCE_SCENARIO_IDS,
  type ResilienceScenarioDefinition,
  type ResilienceScenarioId,
} from "@/lib/types/resilience";

export const RESILIENCE_SCENARIOS: readonly ResilienceScenarioDefinition[] = [
  {
    id: "PAYMENT_DEPLOYMENT_REGRESSION",
    name: "Payment deployment regression",
    description:
      "A bad Payment Service release starts failing payment requests.",
    expectedIncidentType: "deployment_regression",
    expectedActionType: "rollback",
  },
  {
    id: "ORDERS_REDIS_FAILURE",
    name: "Orders Redis failure",
    description: "Redis becomes unhealthy and degrades the Orders Service.",
    expectedIncidentType: "cache_failure",
    expectedActionType: "restart_redis",
  },
  {
    id: "USERS_AUTH_DEPLOYMENT",
    name: "Users authentication deployment",
    description: "A Users Service release breaks authentication.",
    expectedIncidentType: "deployment_regression",
    expectedActionType: "rollback",
  },
  {
    id: "DATABASE_CONNECTION_EXHAUSTION",
    name: "Database connection exhaustion",
    description:
      "The database connection pool is exhausted, degrading dependent services.",
    expectedIncidentType: "database_failure",
    expectedActionType: "recover_database",
  },
] as const;

export function isScenarioId(value: unknown): value is ResilienceScenarioId {
  return (
    typeof value === "string" &&
    (RESILIENCE_SCENARIO_IDS as readonly string[]).includes(value)
  );
}

export function getScenario(
  id: string,
): ResilienceScenarioDefinition | undefined {
  return RESILIENCE_SCENARIOS.find((scenario) => scenario.id === id);
}
