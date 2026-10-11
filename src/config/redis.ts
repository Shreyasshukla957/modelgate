import { createClient } from "redis";
import { env } from "./index.js";

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | undefined;

function createRedisClient() {
  const socket = { connectTimeout: 5_000, reconnectStrategy: false as false };

  if (env.REDIS_URL) return createClient({ url: env.REDIS_URL, socket, disableOfflineQueue: true });

  if (env.REDIS_HOST && env.REDIS_PORT && env.REDIS_PASSWORD) {
    return createClient({
      password: env.REDIS_PASSWORD,
      disableOfflineQueue: true,
      socket: { ...socket, host: env.REDIS_HOST, port: env.REDIS_PORT }
    });
  }

  return undefined;
}

export async function connectRedis() {
  const client = createRedisClient();
  if (!client) return undefined;

  client.on("error", (error) => console.error("Redis client error", error.message));

  try {
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch (error) {
    if (client.isOpen) client.disconnect();
    throw error;
  }
}

export function getRedisClient() {
  return redisClient;
}

export async function disconnectRedis() {
  if (redisClient?.isOpen) await redisClient.quit();
  redisClient = undefined;
}
