/**
 * Central HTTP client for the production simulator.
 *
 * Why this exists:
 * - One place for base URL, timeout, and JSON parsing
 * - Tools stay thin and easy for a future AI agent to call
 * - Mock mode lets you develop without the teammate simulator running
 */

import { resetMockSimulatorState } from "@/lib/simulator/mock";
import { simulatorDetailMessage } from "@/lib/simulator/normalize";
import { SimulatorError } from "@/lib/types/simulator";

const DEFAULT_TIMEOUT_MS = Number(process.env.SIMULATOR_TIMEOUT_MS ?? 30000);

function isMockSimulatorEnabled(): boolean {
  return process.env.USE_MOCK_SIMULATOR === "true";
}

function getBaseUrl(): string {
  const url = process.env.SIMULATOR_URL;
  if (!url) {
    throw new SimulatorError(
      "SIMULATOR_URL is not set. Add it to .env.local",
      500,
    );
  }
  const base = url.replace(/\/$/, "");
  // Vercel (and other hosts) cannot reach the developer's laptop.
  if (
    process.env.VERCEL === "1" &&
    /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base)
  ) {
    throw new SimulatorError(
      "SIMULATOR_URL is set to localhost on Vercel. Deploy the simulator and set SIMULATOR_URL to its public https URL.",
      500,
    );
  }
  return base;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let details: unknown;
      try {
        details = await response.json();
      } catch {
        details = await response.text().catch(() => undefined);
      }
      const detail = simulatorDetailMessage(details);
      throw new SimulatorError(
        detail
          ? `Simulator request failed (${response.status}) for ${path}: ${detail}`
          : `Simulator request failed (${response.status}) for ${path}`,
        502,
        details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SimulatorError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new SimulatorError("Simulator request timed out", 504);
    }

    throw new SimulatorError("Simulator unavailable", 502, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function simulatorGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function simulatorPost<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Exposed for tests that need a clean mock rollback state. */
export { resetMockSimulatorState, isMockSimulatorEnabled };
