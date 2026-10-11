import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiKey } from "../models/api-key.js";
import { UsageLog } from "../models/usage-log.js";
import { reserveRequest } from "../services/budget.js";
import { createChatCompletion, ProviderError } from "../services/llm-provider.js";
import { hashGatewayKey } from "../services/keys.js";
import { enforceRateLimit } from "../services/rate-limit.js";
import { env } from "../config/index.js";
import type { Types } from "mongoose";

const messageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(20_000) });
const completionSchema = z.object({ messages: z.array(messageSchema).min(1).max(50), temperature: z.number().min(0).max(2).optional() });

export async function createCompletion(req: Request, res: Response, next: NextFunction) {
  const requestId = res.locals.requestId as string;
  const gatewayKey = req.header("x-api-key");
  if (!gatewayKey) return res.status(401).json({ error: { code: "missing_gateway_key", message: "Provide an x-api-key header", requestId } });
  let usageRecord: { _id: Types.ObjectId } | undefined;
  let providerSucceeded = false;
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
    const pending = await UsageLog.create({ apiKeyId: apiKey._id, requestId, model: env.PRIMARY_MODEL, provider: "gemini-openai-compatible", status: "pending" }).catch(() => undefined);
    if (!pending) return res.status(503).json({ error: { code: "usage_persistence_unavailable", message: "Usage storage is unavailable. No provider request was sent; the request budget remains consumed.", requestId } });
    usageRecord = pending;
    const result = await createChatCompletion(input.messages, input.temperature);
    providerSucceeded = true;
    const outcome = { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCostUsd: result.estimatedCostUsd, status: "success" };
    // Updating the same record is safe to retry even when the first write's outcome is unknown.
    const saveOutcome = async () => {
      const saved = await UsageLog.updateOne({ _id: pending._id }, { $set: outcome });
      if (!saved.acknowledged || saved.matchedCount !== 1) {
        throw new Error("Usage record was not persisted");
      }
    };
    await saveOutcome().catch(() => saveOutcome());
    res.setHeader("x-gateway-fallback", String(result.usedFallback));
    return res.status(200).json(result.body);
  } catch (error) {
    if (providerSucceeded) return res.status(503).json({ error: { code: "usage_persistence_unavailable", message: "The provider completed this request, but usage could not be saved. The request budget remains consumed; do not automatically retry.", requestId } });
    if (usageRecord) await UsageLog.updateOne({ _id: usageRecord._id }, { $set: { status: "failed", errorCode: error instanceof ProviderError ? "provider_" + error.status : "gateway_error" } }).catch(() => undefined);
    if (error instanceof ProviderError) return res.status(502).json({ error: { code: "provider_unavailable", message: "The model provider could not complete this request. Please try again later.", requestId } });
    next(error);
  }
}
