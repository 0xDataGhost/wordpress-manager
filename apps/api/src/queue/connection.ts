import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Dedicated Redis connection for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` on its connection, so it must not share the
 * general-purpose client.
 */
export const bullConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

bullConnection.on("error", (err) =>
  logger.error({ err }, "BullMQ Redis connection error"),
);

/** Connectivity probe used by /health for the queue subsystem. */
export async function checkQueueConnection(): Promise<void> {
  const pong = await bullConnection.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected BullMQ Redis ping response: ${pong}`);
  }
}
