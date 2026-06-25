import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { codeBatches } from "./code-batches";
import { customers } from "./customers";
import { orderItems } from "./order-items";
import { orders } from "./orders";
import { products } from "./products";
import { suppliers } from "./suppliers";
import { stores } from "./stores";
import { users } from "./users";

/**
 * Canonical lifecycle of a single digital code (plan2 §2.3 / §4.6). `status`
 * stays free text in the database, backed by this source-of-truth list.
 */
export const DIGITAL_CODE_STATUSES = [
  "available",
  "reserved",
  "sold",
  "delivered",
  "replacement",
  "voided",
  "invalid",
  "refunded",
  "expired",
] as const;
export type DigitalCodeStatus = (typeof DIGITAL_CODE_STATUSES)[number];

/**
 * The core digital inventory table (Phase 16, plan2 §4.6). Each row is ONE secret
 * code belonging to a single store (tenant) and product. Tenant-scoped: every
 * row carries a `store_id` and ALL queries MUST scope by it.
 *
 * SECURITY: the raw code is NEVER stored. It is encrypted at rest with
 * AES-256-GCM (`code_cipher` / `code_iv` / `code_tag`) and fingerprinted with a
 * keyed HMAC-SHA256 (`code_hash`) used solely for duplicate detection — see
 * lib/digital-code-crypto. `code_preview` is a masked, non-reversible hint only.
 * Full reveal happens through a dedicated, audited endpoint (later in Phase 16).
 *
 * The unique index `(store_id, product_id, code_hash)` is the duplicate-import
 * guard: the same code can never be inserted twice for a product within a store.
 *
 * The assignment columns (`assigned_*`, `reserved_until`, `sold_at`,
 * `delivered_at`) are part of the table definition per §4.6 but carry NO logic in
 * Phase 16 — they default to null/"available". The reservation/assignment engine
 * that fills them is Phase 17.
 *
 * `supplier_id` has no foreign key here (the `suppliers` table arrives in Phase
 * 20, which adds the FK then — plan2 §20). It stays a plain nullable uuid.
 */
export const digitalCodes = pgTable(
  "digital_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Keep the row if its batch is deleted, so inventory history survives.
    batchId: uuid("batch_id").references(() => codeBatches.id, {
      onDelete: "set null",
    }),
    // Linked to the supplier the code was purchased from (Phase 20). SET NULL on
    // supplier deletion so cost history survives.
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    // Encrypted raw code (AES-256-GCM). NEVER the plaintext.
    codeCipher: text("code_cipher").notNull(),
    codeIv: text("code_iv").notNull(),
    codeTag: text("code_tag").notNull(),
    // Keyed HMAC-SHA256 fingerprint for duplicate detection (not reversible).
    codeHash: text("code_hash").notNull(),
    // Masked, non-reversible preview (e.g. "ABCD••••WXYZ"); never the full code.
    codePreview: text("code_preview"),
    status: text("status").notNull().default("available"),
    // --- Assignment columns (schema only in Phase 16; engine is Phase 17). ---
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    assignedOrderId: uuid("assigned_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    assignedOrderItemId: uuid("assigned_order_item_id").references(
      () => orderItems.id,
      { onDelete: "set null" },
    ),
    assignedCustomerId: uuid("assigned_customer_id").references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Exact decimal unit cost (extra scale for small per-code costs).
    costPrice: numeric("cost_price", { precision: 12, scale: 4 }),
    currency: text("currency"),
    // Generic structured extension point; must never hold raw code material.
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Duplicate-import guard: a code (by fingerprint) is unique per store+product.
    storeProductHashUnique: uniqueIndex(
      "digital_codes_store_product_hash_unique",
    ).on(table.storeId, table.productId, table.codeHash),
    // Backs availability lookups / pool selection per product.
    storeProductStatusIdx: index("digital_codes_store_product_status_idx").on(
      table.storeId,
      table.productId,
      table.status,
    ),
    storeBatchIdx: index("digital_codes_store_batch_idx").on(
      table.storeId,
      table.batchId,
    ),
    storeSupplierIdx: index("digital_codes_store_supplier_idx").on(
      table.storeId,
      table.supplierId,
    ),
    storeOrderIdx: index("digital_codes_store_order_idx").on(
      table.storeId,
      table.assignedOrderId,
    ),
    storeCustomerIdx: index("digital_codes_store_customer_idx").on(
      table.storeId,
      table.assignedCustomerId,
    ),
    storeExpiresIdx: index("digital_codes_store_expires_idx").on(
      table.storeId,
      table.expiresAt,
    ),
    // Backs the tenant listing + deterministic newest-first sort (id tiebreaker).
    storeCreatedIdx: index("digital_codes_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type DigitalCodeRow = typeof digitalCodes.$inferSelect;
export type NewDigitalCodeRow = typeof digitalCodes.$inferInsert;
