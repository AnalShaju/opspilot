import { NextResponse } from "next/server";
import { AgentError } from "@/lib/types/agent";
import { DeepSeekError } from "@/lib/ai/deepseek";
import { SimulatorError } from "@/lib/types/simulator";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status },
  );
}

export function handleRouteError(error: unknown) {
  console.error("[OpsPilot API]", error);

  if (error instanceof SimulatorError) {
    return jsonError(
      error.message.includes("unavailable")
        ? "Simulator unavailable"
        : error.message,
      error.status,
      error.details,
    );
  }

  if (error instanceof DeepSeekError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof AgentError) {
    return jsonError(error.message, 422, { code: error.code });
  }

  if (error instanceof Error) {
    if (error.message.startsWith("Incident not found")) {
      return jsonError(error.message, 404);
    }
    if (
      error.message.includes("No recommended action") ||
      error.message.includes("not allowed") ||
      error.message.includes("Unsupported action") ||
      error.message.includes("Investigate before")
    ) {
      return jsonError(error.message, 400);
    }
    return jsonError(error.message, 500);
  }

  return jsonError("Unexpected server error", 500);
}
