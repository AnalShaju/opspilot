/**
 * Teammate simulator wraps list endpoints as `{ services|logs|...: [...] }`
 * and metrics as `{ payment: {...}, database: {...} }`.
 * Tools normalize to the flat shapes OpsPilot and the agent expect.
 */

export function unwrapList<T>(
  payload: unknown,
  keys: string[],
): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export function normalizeMetrics(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};

  const record = payload as Record<string, unknown>;
  const payment =
    record.payment && typeof record.payment === "object"
      ? (record.payment as Record<string, unknown>)
      : null;

  if (!payment) return record;

  return {
    ...record,
    errorRate:
      typeof payment.errorRate === "number"
        ? payment.errorRate
        : record.errorRate,
    paymentSuccessRate:
      typeof payment.successRate === "number"
        ? payment.successRate
        : record.paymentSuccessRate,
    latencyMs:
      typeof payment.latency === "number"
        ? payment.latency
        : record.latencyMs,
  };
}

export function simulatorDetailMessage(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const message = (details as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

export function isAlreadyRolledBackError(details: unknown): boolean {
  const message = simulatorDetailMessage(details)?.toLowerCase() ?? "";
  return message.includes("already rolled back");
}
