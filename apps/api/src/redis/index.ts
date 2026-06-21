import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * General-purpose Redis client (caching, rate-limit counters, etc.).
 * BullMQ uses its own dedicated connection — see queue/connection.ts.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on("error", (err) => logger.error({ err }, "Redis connection error"));
redis.on("connect", () => logger.info("Redis connected"));

/** Connectivity probe used by startup checks and /health. */
export async function checkRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected Redis ping response: ${pong}`);
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
