import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { orders } from "./orders";
import { products } from "./products";

/**
 * Line items belonging to a synced order. Each item carries the tenant
 * `store_id` (denormalised for store-scoped queries) and cascades when its
 * parent order is removed. `product_id` links to the local catalog row when it
 * could be resolved during sync; `wp_product_id` keeps the WooCommerce reference
 * regardless. On re-sync an order's items are replaced wholesale, so this table
 * is treated as derived data with no independent upsert key.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope (denormalised from the parent order for direct scoping).
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Local catalog link, resolved via external_mappings during sync. Null when
    // the product has not been synced into the catalog.
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    // WooCommerce product id for the line, kept even when productId is null.
    wpProductId: integer("wp_product_id"),
    name: text("name").notNull().default(""),
    sku: text("sku"),
    quantity: integer("quantity").notNull().default(1),
    // Unit price and line total, stored as exact decimals.
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Backs the per-order line-item fetch (every order detail page) and the
    // cascade delete + wholesale replace on re-sync. Without it these are
    // full table scans (this table had no indexes at all).
    orderIdx: index("order_items_order_idx").on(table.orderId),
    // Backs the reverse product lookup and the ON DELETE SET NULL cascade when
    // a product is removed from the catalog.
    productIdx: index("order_items_product_idx").on(table.productId),
  }),
);

export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemRow = typeof orderItems.$inferInsert;
