import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** WooCommerce review moderation states the dashboard exposes. */
export const REVIEW_STATUSES = [
  "approved",
  "hold",
  "spam",
  "trash",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Mirror of WooCommerce product reviews (WordPress comments on products),
 * Phase 29. Keyed for upsert by (store_id, wp_review_id). Moderation writes go
 * through the command outbox; the review body is stored as an excerpt only —
 * the mirror is for the moderation queue, not full content archival.
 */
export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // WordPress comment id; the upsert key within a store.
    wpReviewId: integer("wp_review_id"),
    // WooCommerce product id the review targets.
    wpProductId: integer("wp_product_id"),
    productName: text("product_name"),
    author: text("author"),
    authorEmail: text("author_email"),
    rating: integer("rating").notNull().default(0),
    content: text("content"),
    // "approved" | "hold" | "spam" | "trash".
    status: text("status").notNull().default("hold"),
    wpDateCreated: timestamp("wp_date_created", { withTimezone: true }),
    // date_modified token, when available.
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
    storeWpReviewUnique: uniqueIndex("product_reviews_store_wp_review_unique")
      .on(table.storeId, table.wpReviewId)
      .where(sql`${table.wpReviewId} is not null`),
    storeStatusIdx: index("product_reviews_store_status_idx").on(
      table.storeId,
      table.status,
    ),
  }),
);

export type ProductReviewRow = typeof productReviews.$inferSelect;
export type NewProductReviewRow = typeof productReviews.$inferInsert;
