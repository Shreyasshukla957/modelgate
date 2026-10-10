import { env } from "../config/index.js";
import { z } from "zod";
import { estimateCostUsd, isRetryableProviderStatus, type ModelCost } from "./provider-policy.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ProviderResult = {
  body: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  usedFallback: boolean;
};

const completionResponseSchema = z.object({
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional()
  }).optional()
}).passthrough();

class ProviderError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message);
  }
}

const costFor = (usingFallback: boolean): ModelCost =>
  usingFallback
    ? { inputPer1M: env.FALLBACK_INPUT_COST_PER_1M_USD, outputPer1M: env.FALLBACK_OUTPUT_COST_PER_1M_USD }
    : { inputPer1M: env.PRIMARY_INPUT_COST_PER_1M_USD, outputPer1M: env.PRIMARY_OUTPUT_COST_PER_1M_USD };

function providerErrorMessage(body: unknown) {
  const errorBody = Array.isArray(body) ? body[0] : body;
  if (typeof errorBody !== "object" || !errorBody || !("error" in errorBody)) return "Provider request failed";
  const error = (errorBody as { error?: unknown }).error;
  if (typeof error !== "object" || !error || !("message" in error)) return "Provider request failed";
  return typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "Provider request failed";
}

async function callGeminiOpenAiEndpoint(model: string, messages: ChatMessage[], temperature?: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.GEMINI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GEMINI_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature, stream: false }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));

    if (!response.ok) {
      throw new ProviderError(providerErrorMessage(body), response.status, isRetryableProviderStatus(response.status));
    }
    return completionResponseSchema.parse(body);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider is unavailable";
    throw new ProviderError(message, 503, true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createChatCompletion(messages: ChatMessage[], temperature?: number): Promise<ProviderResult> {
  const candidates = [
    { model: env.PRIMARY_MODEL, fallback: false },
    { model: env.PRIMARY_MODEL, fallback: false },
    ...(env.FALLBACK_MODEL && env.FALLBACK_MODEL !== env.PRIMARY_MODEL ? [{ model: env.FALLBACK_MODEL, fallback: true }] : [])
  ];

  let lastError: ProviderError | undefined;
  for (const candidate of candidates) {
    try {
      const body = await callGeminiOpenAiEndpoint(candidate.model, messages, temperature);
      const inputTokens = body.usage?.prompt_tokens ?? 0;
      const outputTokens = body.usage?.completion_tokens ?? 0;
      return {
        body,
        model: candidate.model,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens, costFor(candidate.fallback)),
        usedFallback: candidate.fallback
      };
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      lastError = error;
      if (!error.retryable) break;
    }
  }
  throw lastError ?? new ProviderError("Provider request failed", 502, false);
}

export { ProviderError };
