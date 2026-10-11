import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiKey } from "../models/api-key.js";
import { UsageLog } from "../models/usage-log.js";
import { createGatewayKey, hashGatewayKey } from "../services/keys.js";

const createKeySchema = z.object({ name: z.string().trim().min(1).max(100), requestLimit: z.number().int().positive().max(1_000_000) });

export async function createVirtualKey(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createKeySchema.parse(req.body);
    const plaintextKey = createGatewayKey();
    const apiKey = await ApiKey.create({ ...input, keyHash: hashGatewayKey(plaintextKey) });
    res.status(201).json({ key: plaintextKey, name: apiKey.name, requestLimit: apiKey.requestLimit, active: apiKey.active, warning: "Save this key now. It cannot be retrieved again." });
  } catch (error) { next(error); }
}

export async function getKeyUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const plaintextKey = req.header("x-api-key");
    if (!plaintextKey) return res.status(400).json({ error: { code: "missing_gateway_key", message: "Provide an x-api-key header", requestId: res.locals.requestId } });
    const key = await ApiKey.findOne({ keyHash: hashGatewayKey(plaintextKey) }).lean();
    if (!key) return res.status(404).json({ error: { code: "key_not_found", message: "Gateway key not found", requestId: res.locals.requestId } });
    const summary = await UsageLog.aggregate([
      { $match: { apiKeyId: key._id } },
      { $group: { _id: "$apiKeyId", requests: { $sum: 1 }, successfulRequests: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } }, pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } }, failedRequests: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }, estimatedCostUsd: { $sum: "$estimatedCostUsd" }, inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" } } }
    ]);
    res.json({ name: key.name, active: key.active, requestLimit: key.requestLimit, requestsUsed: key.requestsUsed, usage: summary[0] ?? { requests: 0, successfulRequests: 0, pendingRequests: 0, failedRequests: 0, estimatedCostUsd: 0, inputTokens: 0, outputTokens: 0 } });
  } catch (error) { next(error); }
}
