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

/** Lifecycle of a product within the SaaS catalog. */
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Catalog products owned by a single store (tenant). Every row carries a
 * `store_id` and all queries must scope by it. `wp_product_id` links a row to
 * the matching WooCommerce product once it has been published/synced; it stays
 * null for catalog-only drafts.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // WooCommerce product id once published/synced; null for catalog-only rows.
    wpProductId: integer("wp_product_id"),
    name: text("name").notNull(),
    description: text("description"),
    shortDescription: text("short_description"),
    // Stored as exact decimal to avoid float rounding on money.
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    status: text("status").notNull().default("draft"),
    imageUrl: text("image_url"),
    // Last successful publish/sync with WooCommerce, for bookkeeping.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // A WooCommerce product maps to at most one catalog row per store.
    // NULL wp_product_id values do not conflict (catalog-only drafts stay free).
    storeWpProductUnique: uniqueIndex("products_store_wp_product_unique")
      .on(table.storeId, table.wpProductId)
      .where(sql`${table.wpProductId} is not null`),
  }),
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
