import { Queue, type QueueOptions } from "bullmq";
import { bullConnection } from "./connection";
import { logger } from "../lib/logger";

const defaultJobOptions: QueueOptions["defaultJobOptions"] = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

const registry = new Map<string, Queue>();

/**
 * Creates (or returns an existing) BullMQ queue bound to the shared
 * connection and sensible production defaults. Business queues
 * (sync_products, automationQueue, ...) are registered in later phases.
 */
export function createQueue(
  name: string,
  options: Partial<QueueOptions> = {},
): Queue {
  const existing = registry.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: bullConnection,
    defaultJobOptions,
    ...options,
  });
  registry.set(name, queue);
  logger.info({ queue: name }, "Queue registered");
  return queue;
}

export function getQueues(): Queue[] {
  return [...registry.values()];
}

export async function closeQueues(): Promise<void> {
  await Promise.all(getQueues().map((queue) => queue.close()));
  await bullConnection.quit();
}
