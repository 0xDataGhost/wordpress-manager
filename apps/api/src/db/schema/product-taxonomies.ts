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

/**
 * The WooCommerce taxonomies a store manages from the dashboard (Phase 26,
 * plan3 §4.2). `kind` distinguishes the three families that share this table:
 *
 *   category  — hierarchical product categories (parentWpId links the tree)
 *   tag       — flat product tags
 *   attribute — global product attributes (pa_*); parentWpId is always null,
 *               attribute terms are a separate concern handled per-product
 *
 * Rows are keyed for upsert by (store_id, kind, wp_term_id). Mirror only —
 * WooCommerce remains the source of truth; writes go through the command outbox.
 */
export const PRODUCT_TAXONOMY_KINDS = [
  "category",
  "tag",
  "attribute",
] as const;
export type ProductTaxonomyKind = (typeof PRODUCT_TAXONOMY_KINDS)[number];

export const productTaxonomies = pgTable(
  "product_taxonomies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // "category" | "tag" | "attribute".
    kind: text("kind").notNull(),
    // WooCommerce term id (or attribute id for kind=attribute). Upsert key.
    wpTermId: integer("wp_term_id"),
    name: text("name").notNull(),
    slug: text("slug"),
    description: text("description"),
    // Parent WooCommerce term id for hierarchical categories; null otherwise.
    parentWpId: integer("parent_wp_id"),
    // WooCommerce product count for the term (informational).
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeKindTermUnique: uniqueIndex(
      "product_taxonomies_store_kind_term_unique",
    )
      .on(table.storeId, table.kind, table.wpTermId)
      .where(sql`${table.wpTermId} is not null`),
    storeKindIdx: index("product_taxonomies_store_kind_idx").on(
      table.storeId,
      table.kind,
    ),
  }),
);

export type ProductTaxonomyRow = typeof productTaxonomies.$inferSelect;
export type NewProductTaxonomyRow = typeof productTaxonomies.$inferInsert;
