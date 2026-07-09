import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** WooCommerce discount types the dashboard supports. */
export const COUPON_DISCOUNT_TYPES = [
  "percent",
  "fixed_cart",
  "fixed_product",
] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

/**
 * Mirror of WooCommerce coupons (Phase 28, plan3 §4.2). Keyed for upsert by
 * (store_id, wp_coupon_id). WooCommerce is the source of truth; dashboard
 * writes go through the command outbox and refresh this mirror. `restrictions`
 * carries the less-common fields (product/category/email limits, exclusions) as
 * jsonb so the mirror stays faithful without a wide column list.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // WooCommerce coupon id; the upsert key within a store.
    wpCouponId: integer("wp_coupon_id"),
    code: text("code").notNull(),
    discountType: text("discount_type").notNull().default("fixed_cart"),
    amount: numeric("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    description: text("description"),
    freeShipping: boolean("free_shipping").notNull().default(false),
    // Usage.
    usageCount: integer("usage_count").notNull().default(0),
    usageLimit: integer("usage_limit"),
    usageLimitPerUser: integer("usage_limit_per_user"),
    // Inclusive expiry date (WooCommerce stores a date, not a datetime).
    dateExpires: timestamp("date_expires", { withTimezone: true }),
    // product_ids, excluded_product_ids, product_categories, minimum_amount,
    // maximum_amount, email_restrictions, individual_use, exclude_sale_items.
    restrictions: jsonb("restrictions"),
    // date_modified unix timestamp — compare-and-set token.
    wpVersion: text("wp_version"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeWpCouponUnique: uniqueIndex("coupons_store_wp_coupon_unique")
      .on(table.storeId, table.wpCouponId)
      .where(sql`${table.wpCouponId} is not null`),
    storeCodeIdx: index("coupons_store_code_idx").on(table.storeId, table.code),
  }),
);

export type CouponRow = typeof coupons.$inferSelect;
export type NewCouponRow = typeof coupons.$inferInsert;
