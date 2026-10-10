import { env } from "../config/index.js";
import { getRedisClient } from "../config/redis.js";

const WINDOW_MS = 60_000;
const incrementWithExpiry = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return current
`;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number; remaining?: number };

export async function enforceRateLimit(keyHash: string): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) return { allowed: true };
  const window = Math.floor(Date.now() / WINDOW_MS);
  const key = `modelgate:rate-limit:${keyHash}:${window}`;
  const count = Number(await redis.eval(incrementWithExpiry, { keys: [key], arguments: [String(WINDOW_MS)] }));
  const remaining = Math.max(0, env.RATE_LIMIT_REQUESTS_PER_MINUTE - count);
  if (count <= env.RATE_LIMIT_REQUESTS_PER_MINUTE) return { allowed: true, remaining };
  const ttl = await redis.pTTL(key);
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
}
