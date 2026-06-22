import { sql } from "drizzle-orm";
import {
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
 * WooCommerce orders synced into a single store (tenant). Every row carries a
 * `store_id` and all queries must scope by it. `wp_order_id` is the upsert key
 * within a store; `customer_id` links to the local customer row when the buyer
 * could be resolved (guest checkouts leave it null). Money is stored as exact
 * decimal and the original Woo timestamps are preserved in placed_at.
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
  }),
);

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
