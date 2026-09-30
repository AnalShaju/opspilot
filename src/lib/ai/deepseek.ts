/**
 * Server-side DeepSeek client (OpenAI-compatible Chat Completions).
 * Never import this into client components.
 */

export type DeepSeekRole = "system" | "user" | "assistant" | "tool";

export interface DeepSeekMessage {
  role: DeepSeekRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: DeepSeekToolCall[];
  name?: string;
}

export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface DeepSeekToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekChoiceMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: DeepSeekToolCall[];
}

export interface DeepSeekResponse {
  choices: Array<{
    message: DeepSeekChoiceMessage;
    finish_reason?: string;
  }>;
}

export class DeepSeekError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new DeepSeekError(
      "DEEPSEEK_API_KEY is not set. Add it to .env.local",
      500,
    );
  }
  return key;
}

export async function callDeepSeek(options: {
  messages: DeepSeekMessage[];
  tools?: DeepSeekToolDefinition[];
  temperature?: number;
  model?: string;
  /** Ask the API to return a single JSON object. */
  jsonMode?: boolean;
}): Promise<DeepSeekChoiceMessage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: options.model ?? "deepseek-chat",
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tools?.length ? "auto" : undefined,
        temperature: options.temperature ?? 0.2,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new DeepSeekError(
        `DeepSeek request failed (${response.status})${details ? `: ${details.slice(0, 240)}` : ""}`,
        response.status >= 500 ? 502 : response.status,
      );
    }

    const data = (await response.json()) as DeepSeekResponse;
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new DeepSeekError("DeepSeek returned an empty response", 502);
    }
    return message;
  } catch (error) {
    if (error instanceof DeepSeekError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekError("DeepSeek request timed out", 504);
    }
    throw new DeepSeekError(
      error instanceof Error ? error.message : "DeepSeek unavailable",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
