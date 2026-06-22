import type { Queue } from "bullmq";
import { createQueue } from "./index";

/**
 * BullMQ queue + job foundation for WooCommerce sync and product publish.
 *
 * Phase 6 scope note: the queues and typed enqueue helpers are defined here as
 * the asynchronous-processing foundation, but manual sync and publish currently
 * run SYNCHRONOUSLY inside the request (see sync.service / products.service).
 * There is no worker consuming these queues yet — the dedicated workers app is a
 * later phase. `registerQueues()` is called at boot so the queues exist and are
 * observable; enqueue helpers are ready for when workers land. This keeps the
 * manual sync working today while leaving a clean seam for background execution.
 */

export const QUEUE_NAMES = {
  syncProducts: "sync_products",
  syncOrders: "sync_orders",
  syncCustomers: "sync_customers",
  syncAll: "sync_all",
  publishProductToWp: "publish_product_to_wp",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Maps a sync entity to its queue name. */
const SYNC_QUEUE_BY_ENTITY: Record<
  "product" | "order" | "customer" | "all",
  QueueName
> = {
  product: QUEUE_NAMES.syncProducts,
  order: QUEUE_NAMES.syncOrders,
  customer: QUEUE_NAMES.syncCustomers,
  all: QUEUE_NAMES.syncAll,
};

export interface SyncJobData {
  storeId: string;
  /** The sync_jobs row id this background run should update. */
  syncJobId: string;
  trigger: "dashboard" | "wordpress";
}

export interface PublishProductJobData {
  storeId: string;
  productId: string;
}

/** Registers every Phase 6 queue. Safe to call once at boot (idempotent). */
export function registerQueues(): void {
  for (const name of Object.values(QUEUE_NAMES)) {
    createQueue(name);
  }
}

/** Returns the queue for a sync entity, creating it on first use. */
export function getSyncQueue(
  entity: "product" | "order" | "customer" | "all",
): Queue {
  return createQueue(SYNC_QUEUE_BY_ENTITY[entity]);
}

/** Returns the product-publish queue, creating it on first use. */
export function getPublishQueue(): Queue {
  return createQueue(QUEUE_NAMES.publishProductToWp);
}

/**
 * Enqueues a background sync job. Not used on the synchronous Phase 6 path; kept
 * as the seam a future worker will consume. The job name matches the entity.
 */
export async function enqueueSyncJob(
  entity: "product" | "order" | "customer" | "all",
  data: SyncJobData,
): Promise<void> {
  await getSyncQueue(entity).add(`sync_${entity}`, data);
}

/** Enqueues a background product-publish job (future worker seam). */
export async function enqueuePublishProductJob(
  data: PublishProductJobData,
): Promise<void> {
  await getPublishQueue().add("publish_product_to_wp", data);
}
