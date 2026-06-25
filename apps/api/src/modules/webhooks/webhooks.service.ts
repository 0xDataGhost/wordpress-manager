import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { logger } from "../../lib/logger";
import { AppError } from "../../lib/errors";
import { products } from "../../db/schema/products";
import { orders } from "../../db/schema/orders";
import {
  webhookEvents,
  type WebhookEventRow,
} from "../../db/schema/webhook-events";
import { touchLastSync } from "../connections/connections.service";
import { maybeAssignCodesForOrder } from "../digital-delivery/digital-delivery.service";
import { upsertCustomersFromWoo } from "../sync/customers.sync";
import { upsertOrdersFromWoo } from "../sync/orders.sync";
import { upsertProductsFromWoo } from "../sync/products.sync";
import type {
  CustomerWebhookInput,
  OrderWebhookInput,
  ProductWebhookInput,
  WebhookEntity,
  WebhookInput,
} from "./webhooks.schemas";

const WEBHOOK_SOURCE = "woocommerce";

/** What the incremental upsert did for an event (for observability/response). */
export type WebhookAction = "created" | "updated" | "archived" | "noop";

export interface WebhookProcessResult {
  /** The recorded webhook_events row (new, or the existing one on a duplicate). */
  eventRow: WebhookEventRow;
  /** True when this exact delivery (same eventId) was already received before. */
  duplicate: boolean;
  /** True when the event was processed in this request. */
  processed: boolean;
  /** The upsert outcome, or null for duplicates / unprocessed events. */
  action: WebhookAction | null;
}

/**
 * Records an inbound webhook and processes it idempotently. Tenant scope flows
 * from `storeId` (resolved from the connector API key) through every query.
 *
 * Idempotency has two layers:
 *  1. Event level — the (store_id, source, external_event_id) unique index means
 *     a re-delivered event with the same eventId is recorded once; the duplicate
 *     is ignored and NOT reprocessed.
 *  2. Data level — the per-entity upserts key on the WooCommerce id, so even an
 *     event that slips through with a fresh eventId can never create duplicate
 *     product/order/customer rows.
 *
 * Phase 13 processes inline (synchronously) for the MVP — see queues.ts for the
 * background-worker seam that replaces this when a worker app lands. A failed
 * event is recorded with status "failed" and its error before the request fails,
 * so failures are never silently swallowed and can be replayed later.
 */
export async function recordAndProcessWebhook(
  storeId: string,
  entity: WebhookEntity,
  input: WebhookInput,
): Promise<WebhookProcessResult> {
  const received = await recordEvent(storeId, input);

  // Duplicate delivery: the event already exists, so do nothing further.
  if (!received) {
    const existing = await findEventByExternalId(storeId, input.eventId);
    if (!existing) {
      // Extremely unlikely (the insert conflicted but the row vanished). Treat
      // as a transient failure rather than reporting a misleading success.
      throw new AppError("Failed to record webhook event", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }
    return {
      eventRow: existing,
      duplicate: true,
      processed: false,
      action: null,
    };
  }

  try {
    const action = await processEvent(storeId, entity, input);
    const processedRow = await markProcessed(received.id);
    // Stamp the connection's last-sync time so real-time updates surface in the
    // dashboard's "last sync" exactly like a manual sync does.
    await touchLastSync(storeId);
    return {
      eventRow: processedRow,
      duplicate: false,
      processed: true,
      action,
    };
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : "Webhook processing failed due to an internal error.";
    await markFailed(received.id, message);
    logger.error({ err, storeId, entity, event: input.event }, "Webhook failed");
    throw err instanceof AppError
      ? err
      : new AppError("Failed to process webhook event", {
          statusCode: 500,
          code: "INTERNAL_ERROR",
        });
  }
}

/**
 * Inserts the event in the "received" state. Returns the new row, or null when
 * the (store_id, source, external_event_id) unique index rejects it as a
 * duplicate delivery. The full envelope is stored as the raw payload for replay.
 */
async function recordEvent(
  storeId: string,
  input: WebhookInput,
): Promise<WebhookEventRow | null> {
  const [row] = await db
    .insert(webhookEvents)
    .values({
      storeId,
      source: WEBHOOK_SOURCE,
      topic: input.event,
      externalEventId: input.eventId,
      status: "received",
      payload: input,
    })
    .onConflictDoNothing({
      target: [
        webhookEvents.storeId,
        webhookEvents.source,
        webhookEvents.externalEventId,
      ],
      where: sql`${webhookEvents.externalEventId} is not null`,
    })
    .returning();
  return row ?? null;
}

/** Loads an event by its idempotency key within a store (duplicate lookup). */
async function findEventByExternalId(
  storeId: string,
  eventId: string,
): Promise<WebhookEventRow | null> {
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.storeId, storeId),
        eq(webhookEvents.source, WEBHOOK_SOURCE),
        eq(webhookEvents.externalEventId, eventId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Dispatches a validated event to the matching incremental upsert. */
async function processEvent(
  storeId: string,
  entity: WebhookEntity,
  input: WebhookInput,
): Promise<WebhookAction> {
  switch (entity) {
    case "product":
      return processProductEvent(storeId, input as ProductWebhookInput);
    case "order":
      return processOrderEvent(storeId, input as OrderWebhookInput);
    case "customer":
      return processCustomerEvent(storeId, input as CustomerWebhookInput);
    default:
      // Exhaustiveness guard — entity is constrained by the route.
      throw new AppError("Unsupported webhook entity", {
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
  }
}

/**
 * product.created / product.updated reuse the manual-sync upsert (idempotent by
 * wpProductId); product.deleted archives the local row using the catalog's
 * existing "archived" status — the same soft-delete the dashboard already
 * applies, NOT a new deletion strategy.
 */
async function processProductEvent(
  storeId: string,
  input: ProductWebhookInput,
): Promise<WebhookAction> {
  if (input.event === "product.deleted") {
    return archiveProductByExternalId(storeId, input.externalId);
  }
  // data presence is guaranteed for created/updated by the schema refinement.
  const result = await upsertProductsFromWoo(storeId, [input.data!]);
  return result.created > 0 ? "created" : "updated";
}

/** order.created / order.updated upsert via the shared, idempotent order sync. */
async function processOrderEvent(
  storeId: string,
  input: OrderWebhookInput,
): Promise<WebhookAction> {
  const result = await upsertOrdersFromWoo(storeId, [input.data]);

  // Phase 17 integration seam: after the order is upserted, reserve/assign
  // digital codes when its status makes products eligible. maybeAssignCodesForOrder
  // is status-gated and fully best-effort (never throws), so it cannot fail the
  // webhook; re-running on every order.updated is idempotent.
  const [orderRow] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.wpOrderId, input.data.wpOrderId),
      ),
    )
    .limit(1);
  if (orderRow) {
    await maybeAssignCodesForOrder(storeId, orderRow.id);
  }

  return result.created > 0 ? "created" : "updated";
}

/** customer.created / customer.updated upsert via the shared customer sync. */
async function processCustomerEvent(
  storeId: string,
  input: CustomerWebhookInput,
): Promise<WebhookAction> {
  const result = await upsertCustomersFromWoo(storeId, [input.data]);
  return result.created > 0 ? "created" : "updated";
}

/**
 * Archives a store-owned product matched by its WooCommerce id. Reuses the
 * existing "archived" status so historical references and the external mapping
 * survive. Returns "noop" when no local product matches (nothing to archive).
 */
async function archiveProductByExternalId(
  storeId: string,
  externalId: string,
): Promise<WebhookAction> {
  const wpProductId = Number(externalId);
  if (!Number.isInteger(wpProductId) || wpProductId <= 0) {
    return "noop";
  }
  const updated = await db
    .update(products)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(products.storeId, storeId),
        eq(products.wpProductId, wpProductId),
      ),
    )
    .returning({ id: products.id });
  return updated.length > 0 ? "archived" : "noop";
}

/** Marks an event processed with the completion timestamp. */
async function markProcessed(eventId: string): Promise<WebhookEventRow> {
  const now = new Date();
  const [row] = await db
    .update(webhookEvents)
    .set({ status: "processed", processedAt: now })
    .where(eq(webhookEvents.id, eventId))
    .returning();
  if (!row) {
    throw new Error("Failed to finalize webhook event");
  }
  return row;
}

/** Marks an event failed and records a bounded error message. */
async function markFailed(eventId: string, message: string): Promise<void> {
  const now = new Date();
  await db
    .update(webhookEvents)
    .set({ status: "failed", error: message.slice(0, 1000), processedAt: now })
    .where(eq(webhookEvents.id, eventId));
}

/** Lists recent webhook events for a store, newest first (for GET status). */
export async function listRecentWebhookEvents(
  storeId: string,
  limit = 20,
): Promise<WebhookEventRow[]> {
  return db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.storeId, storeId))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(limit);
}
