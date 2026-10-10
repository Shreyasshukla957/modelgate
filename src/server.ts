import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/index.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";

async function start() {
  await connectDatabase();

  try {
    const redis = await connectRedis();
    if (redis) console.log("Redis burst rate limit enabled");
  } catch (error) {
    console.warn("Redis unavailable; continuing with MongoDB request budgets only", error instanceof Error ? error.message : error);
  }

  const server = app.listen(env.PORT, () => console.log(`LLM gateway listening on port ${env.PORT}`));

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; closing gateway`);
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => { console.error("Failed to start gateway", error); process.exit(1); });
