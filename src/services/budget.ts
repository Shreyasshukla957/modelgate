import { ApiKey } from "../models/api-key.js";

export async function reserveRequest(keyHash: string) {
  return ApiKey.findOneAndUpdate(
    { keyHash, active: true, $expr: { $lt: ["$requestsUsed", "$requestLimit"] } },
    { $inc: { requestsUsed: 1 } },
    { new: true }
  );
}