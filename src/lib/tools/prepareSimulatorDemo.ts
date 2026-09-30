import { verifyHealth } from "@/lib/tools/verifyHealth";
import {
  resetSimulator,
  simulateScenario,
} from "@/lib/tools/simulatorScenarios";

export const DEMO_SCENARIO_ID = "PAYMENT_DEPLOYMENT_REGRESSION";

/**
 * Puts the simulator into the demo failure (Payment deployment regression)
 * via the public scenario APIs.
 *
 * - Already in that scenario: nothing to do.
 * - Healthy: just simulate.
 * - Some other scenario is active: reset first, unless `preserveActive` is set
 *   (a Resilience Test owns the simulator and must not be disturbed).
 */
export async function prepareDemoScenario(options?: {
  preserveActive?: boolean;
}): Promise<void> {
  let activeScenario: string | null | undefined;
  try {
    activeScenario = (await verifyHealth()).activeScenario;
  } catch {
    activeScenario = undefined;
  }

  if (activeScenario === DEMO_SCENARIO_ID) return;
  if (activeScenario && options?.preserveActive) return;

  if (activeScenario !== null) {
    // Unknown state (older simulator) or a different scenario: start clean.
    await resetSimulator();
  }

  await simulateScenario(DEMO_SCENARIO_ID);
}
