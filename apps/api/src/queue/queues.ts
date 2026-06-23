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

/**
 * Phase 11 automation queues. Like the sync queues these are registered as
 * foundation: there is no worker consuming them yet, and the manual execution
 * helpers (automations.service) run SYNCHRONOUSLY. The WhatsApp helper enqueues
 * `send_whatsapp_order_message` as a placeholder (no real message is sent and
 * no consumer drains it) so the "job is queued after a new order" path exists.
 */
export const AUTOMATION_QUEUE_NAMES = {
  automation: "automation",
  notification: "notification",
  report: "report",
  whatsapp: "whatsapp",
} as const;

export type AutomationQueueName =
  (typeof AUTOMATION_QUEUE_NAMES)[keyof typeof AUTOMATION_QUEUE_NAMES];

/** Automation job names (one per Phase 11 automation behavior). */
export const AUTOMATION_JOB_NAMES = {
  lowStockCheck: "low_stock_check",
  sendDailyReport: "send_daily_report",
  sendWhatsappOrderMessage: "send_whatsapp_order_message",
} as const;

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

/** Registers every Phase 6 + Phase 11 queue. Safe to call once at boot (idempotent). */
export function registerQueues(): void {
  for (const name of Object.values(QUEUE_NAMES)) {
    createQueue(name);
  }
  for (const name of Object.values(AUTOMATION_QUEUE_NAMES)) {
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

/* --------------------------- Phase 11 automations ------------------------- */

export interface WhatsappOrderJobData {
  storeId: string;
  automationId: string;
  orderId: string;
  /** The rendered message that WOULD be sent. No real WhatsApp is dispatched. */
  message: string;
}

/** Returns an automation queue, creating it on first use. */
export function getAutomationQueue(name: AutomationQueueName): Queue {
  return createQueue(name);
}

/**
 * Enqueues the WhatsApp order-message placeholder onto the whatsapp queue. This
 * is foundation only — no worker drains the queue and no real message is sent.
 * The job's presence demonstrates the "message is queued after a new order"
 * path; actual delivery is deferred to the WhatsApp provider integration phase.
 */
export async function enqueueWhatsappOrderMessage(
  data: WhatsappOrderJobData,
): Promise<void> {
  await getAutomationQueue(AUTOMATION_QUEUE_NAMES.whatsapp).add(
    AUTOMATION_JOB_NAMES.sendWhatsappOrderMessage,
    data,
  );
}
