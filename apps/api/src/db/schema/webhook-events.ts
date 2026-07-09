import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** Processing state of a received webhook event. */
export const WEBHOOK_EVENT_STATUSES = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

/**
 * Inbound webhook events from external systems, tenant-scoped by `store_id`.
 *
 * Phase 6 only CREATES this table as part of the sync foundation — webhooks are
 * NOT received or processed yet (that lands in Phase 13). The
 * (store_id, source, external_event_id) unique index is the idempotency key that
 * will let the future webhook handler ignore duplicate deliveries. The raw
 * payload is stored as jsonb for later replay/debugging.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("woocommerce"),
    // Woo webhook topic, e.g. "order.created", "product.updated".
    topic: text("topic").notNull(),
    // Delivery id from the source, used for idempotency. Null when the source
    // does not provide one.
    externalEventId: text("external_event_id"),
    // "received" | "processed" | "ignored" | "failed".
    status: text("status").notNull().default("received"),
    payload: jsonb("payload"),
    error: text("error"),
    // Set when this event is the echo of a wp_commands row this SaaS issued
    // (the connector round-trips X-Saas-Command-Id onto the webhooks the
    // mutation fires). Echoed events confirm their command and are NOT
    // re-processed as external changes (Phase 25 echo suppression).
    originCommandId: uuid("origin_command_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Idempotency: a given delivery is recorded once per store/source.
    deliveryUnique: uniqueIndex("webhook_events_delivery_unique")
      .on(table.storeId, table.source, table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    storeRecentIdx: index("webhook_events_store_recent_idx").on(
      table.storeId,
      table.receivedAt,
    ),
  }),
);

export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type NewWebhookEventRow = typeof webhookEvents.$inferInsert;
