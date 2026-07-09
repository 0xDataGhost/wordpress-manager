import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { customers } from "./customers";

/**
 * Canonical WooCommerce order statuses. The `status` column itself is free text
 * (the connector writes whatever Woo reports), but this list is the source of
 * truth for the dashboard's status filter and status labels.
 */
export const ORDER_STATUSES = [
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Order-level digital fulfillment status (Phase 17, plan2 §2.4). Free text backed
 * by this list. Maintained by the assignment engine — `not_required` for orders
 * with no digital items, otherwise pending/partial/completed/manual_review as
 * codes are assigned. `failed`/`cancelled`/`refunded` are reserved for later phases.
 */
export const ORDER_DIGITAL_DELIVERY_STATUSES = [
  "not_required",
  "pending",
  "reserved",
  "partial",
  "completed",
  "failed",
  "manual_review",
  "cancelled",
  "refunded",
] as const;
export type OrderDigitalDeliveryStatus =
  (typeof ORDER_DIGITAL_DELIVERY_STATUSES)[number];

/**
 * WooCommerce orders synced into a single store (tenant). Every row carries a
 * `store_id` and all queries must scope by it. `wp_order_id` is the upsert key
 * within a store; `customer_id` links to the local customer row when the buyer
 * could be resolved (guest checkouts leave it null). Money is stored as exact
 * decimal and the original Woo timestamps are preserved in placed_at.
 *
 * `internal_notes` is dashboard-owned (never written by sync) so operators can
 * annotate an order without touching WooCommerce.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // WooCommerce order id; the upsert key within a store.
    wpOrderId: integer("wp_order_id"),
    // Local customer link, resolved via external_mappings during sync. Null for
    // guest orders or when the customer has not been synced yet.
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    // Human-facing order number (Woo may differ from the numeric id).
    orderNumber: text("order_number"),
    status: text("status").notNull().default("pending"),
    // Stored as exact decimal to avoid float rounding on money.
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("SAR"),
    paymentMethod: text("payment_method"),
    // Mirror of WooCommerce get_total_refunded(); exact decimal (Phase 27).
    totalRefunded: numeric("total_refunded", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    // Entity version token from the connector (date_modified unix timestamp).
    // Sent back as the compare-and-set token on money-sensitive commands.
    wpVersion: text("wp_version"),
    // Dashboard-only operator notes. Never written by WooCommerce sync.
    internalNotes: text("internal_notes"),
    // Digital fulfillment (Phase 17). Maintained by the assignment engine and
    // NOT written by WooCommerce sync, so they persist across re-syncs. One of
    // ORDER_DIGITAL_DELIVERY_STATUSES.
    digitalDeliveryStatus: text("digital_delivery_status")
      .notNull()
      .default("not_required"),
    // True once the engine has determined the order needs digital codes.
    digitalDeliveryRequired: boolean("digital_delivery_required")
      .notNull()
      .default(false),
    // Set when all required codes are assigned (status = completed).
    digitalDeliveryCompletedAt: timestamp("digital_delivery_completed_at", {
      withTimezone: true,
    }),
    // When the order was placed in WooCommerce (distinct from our created_at).
    placedAt: timestamp("placed_at", { withTimezone: true }),
    // Last successful sync with WooCommerce, for bookkeeping.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // A WooCommerce order maps to at most one row per store. NULL wp_order_id
    // values do not conflict.
    storeWpOrderUnique: uniqueIndex("orders_store_wp_order_unique")
      .on(table.storeId, table.wpOrderId)
      .where(sql`${table.wpOrderId} is not null`),
    // Supports per-customer order lookups (customer metrics + linked orders).
    // Partial: guest orders (null customer_id) never match a customer query.
    storeCustomerIdx: index("orders_store_customer_idx")
      .on(table.storeId, table.customerId)
      .where(sql`${table.customerId} is not null`),
    // Backs the general tenant listing (store_id + date sort). The partial
    // customer index above excludes guest orders, so it cannot serve the list.
    storeCreatedIdx: index("orders_store_created_idx").on(
      table.storeId,
      table.createdAt,
    ),
    // Backs the status filter on the orders list.
    storeStatusIdx: index("orders_store_status_idx").on(
      table.storeId,
      table.status,
    ),
    // Backs the digital delivery queue filter (Phase 17).
    storeDigitalStatusIdx: index("orders_store_digital_status_idx").on(
      table.storeId,
      table.digitalDeliveryStatus,
    ),
  }),
);

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
