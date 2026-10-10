import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiKey } from "../models/api-key.js";
import { UsageLog } from "../models/usage-log.js";
import { reserveRequest } from "../services/budget.js";
import { createChatCompletion, ProviderError } from "../services/llm-provider.js";
import { hashGatewayKey } from "../services/keys.js";
import { enforceRateLimit } from "../services/rate-limit.js";

const messageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(20_000) });
const completionSchema = z.object({ messages: z.array(messageSchema).min(1).max(50), temperature: z.number().min(0).max(2).optional() });

export async function createCompletion(req: Request, res: Response, next: NextFunction) {
  const requestId = res.locals.requestId as string;
  const gatewayKey = req.header("x-api-key");
  if (!gatewayKey) return res.status(401).json({ error: { code: "missing_gateway_key", message: "Provide an x-api-key header", requestId } });
  let apiKeyId: unknown;
  try {
    const input = completionSchema.parse(req.body);
    const keyHash = hashGatewayKey(gatewayKey);
    const knownKey = await ApiKey.findOne({ keyHash }).lean();
    if (!knownKey) return res.status(401).json({ error: { code: "invalid_gateway_key", message: "Gateway key is invalid", requestId } });
    if (!knownKey.active) return res.status(403).json({ error: { code: "inactive_gateway_key", message: "Gateway key is inactive", requestId } });
    const rateLimit = await enforceRateLimit(keyHash);
    if (!rateLimit.allowed) {
      res.setHeader("retry-after", String(rateLimit.retryAfterSeconds));
      return res.status(429).json({ error: { code: "rate_limited", message: "Gateway key has exceeded its request rate", requestId, retryAfterSeconds: rateLimit.retryAfterSeconds } });
    }
    const apiKey = await reserveRequest(keyHash);
    if (!apiKey) return res.status(429).json({ error: { code: "budget_exhausted", message: "Gateway key has reached its request budget", requestId } });
    apiKeyId = apiKey._id;
    const result = await createChatCompletion(input.messages, input.temperature);
    await UsageLog.create({ apiKeyId, requestId, model: result.model, provider: "gemini-openai-compatible", inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCostUsd: result.estimatedCostUsd, status: "success" });
    res.setHeader("x-gateway-fallback", String(result.usedFallback));
    return res.status(200).json(result.body);
  } catch (error) {
    if (apiKeyId) await UsageLog.create({ apiKeyId, requestId, model: "unavailable", provider: "gemini-openai-compatible", status: "failed", errorCode: error instanceof ProviderError ? "provider_" + error.status : "gateway_error" }).catch(() => undefined);
    if (error instanceof ProviderError) return res.status(502).json({ error: { code: "provider_unavailable", message: error.message, requestId } });
    next(error);
  }
}
