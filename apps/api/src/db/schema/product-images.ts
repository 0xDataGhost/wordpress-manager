import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { products } from "./products";

/**
 * Gallery images for a catalog product. Carries the tenant `store_id`
 * (denormalised for store-scoped queries) and cascades with its parent product.
 * `wp_image_id` is the WooCommerce media id used as the per-product upsert key
 * during sync; `position` preserves gallery order. The single primary image is
 * still mirrored onto products.image_url for list/thumbnail rendering.
 */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope (denormalised from the parent product for direct scoping).
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // WooCommerce media id; the upsert key within a product.
    wpImageId: integer("wp_image_id"),
    src: text("src").notNull(),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // A Woo media id maps to at most one image per product. NULL wp_image_id
    // values do not conflict.
    productWpImageUnique: uniqueIndex("product_images_product_wp_image_unique")
      .on(table.productId, table.wpImageId)
      .where(sql`${table.wpImageId} is not null`),
  }),
);

export type ProductImageRow = typeof productImages.$inferSelect;
export type NewProductImageRow = typeof productImages.$inferInsert;
