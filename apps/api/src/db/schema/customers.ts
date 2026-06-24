import { sql } from "drizzle-orm";
import {
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

/**
 * WooCommerce customers synced into a single store (tenant). Every row carries a
 * `store_id` and all queries must scope by it. `wp_customer_id` links a row to the
 * matching WooCommerce customer; it stays null only for rows that originated
 * outside Woo (none yet in this phase). Aggregate fields (total_spent,
 * orders_count, last_order_at) mirror WooCommerce's customer summary and are
 * refreshed on each sync.
 *
 * `internal_notes` is dashboard-owned (never written by sync) so operators can
 * annotate a customer without touching WooCommerce.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // WooCommerce customer id; the upsert key within a store.
    wpCustomerId: integer("wp_customer_id"),
    name: text("name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    // Stored as exact decimal to avoid float rounding on money.
    totalSpent: numeric("total_spent", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    ordersCount: integer("orders_count").notNull().default(0),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    // Dashboard-only operator notes. Never written by WooCommerce sync.
    internalNotes: text("internal_notes"),
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
    // A WooCommerce customer maps to at most one row per store. NULL
    // wp_customer_id values do not conflict.
    storeWpCustomerUnique: uniqueIndex("customers_store_wp_customer_unique")
      .on(table.storeId, table.wpCustomerId)
      .where(sql`${table.wpCustomerId} is not null`),
    // Backs the primary tenant listing (store_id + newest-first sort). The
    // partial unique index above cannot serve the general list.
    storeCreatedIdx: index("customers_store_created_idx").on(
      table.storeId,
      table.createdAt,
    ),
  }),
);

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomerRow = typeof customers.$inferInsert;
