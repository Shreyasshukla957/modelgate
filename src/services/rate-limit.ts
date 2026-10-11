import { env } from "../config/index.js";
import { getRedisClient } from "../config/redis.js";

const WINDOW_MS = 60_000;
const incrementWithExpiry = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return current
`;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number; remaining?: number };

export async function enforceRateLimit(
  keyHash: string,
  redis: Pick<NonNullable<ReturnType<typeof getRedisClient>>, "isReady" | "eval"> | undefined = getRedisClient()
): Promise<RateLimitResult> {
  if (!redis || !redis.isReady) return { allowed: true };
  const window = Math.floor(Date.now() / WINDOW_MS);
  const key = `modelgate:rate-limit:${keyHash}:${window}`;
  let count: number;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    count = Number(await Promise.race([
      redis.eval(incrementWithExpiry, { keys: [key], arguments: [String(WINDOW_MS)] }),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Redis rate-limit timeout")), 1_000); })
    ]));
  } catch {
    console.warn("Redis rate limit unavailable; MongoDB request budget remains enforced");
    return { allowed: true };
  } finally {
    clearTimeout(timeout);
  }
  const remaining = Math.max(0, env.RATE_LIMIT_REQUESTS_PER_MINUTE - count);
  if (count <= env.RATE_LIMIT_REQUESTS_PER_MINUTE) return { allowed: true, remaining };
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - Date.now()) / 1000)) };
}
