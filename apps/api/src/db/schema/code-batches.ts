import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { stores } from "./stores";
import { suppliers } from "./suppliers";
import { users } from "./users";

/**
 * Lifecycle of an imported code batch (plan2 §4.5). `status` stays free text in
 * the database (so future kinds need no migration) but this list is the source
 * of truth for validation and labels — matching the codebase's status pattern.
 */
export const CODE_BATCH_STATUSES = [
  "active",
  "paused",
  "consumed",
  "archived",
] as const;
export type CodeBatchStatus = (typeof CODE_BATCH_STATUSES)[number];

/** Where a batch's codes came from. Extensible; manual import is the MVP source. */
export const CODE_BATCH_SOURCES = ["manual_import"] as const;
export type CodeBatchSource = (typeof CODE_BATCH_SOURCES)[number];

/**
 * A batch groups codes imported together for a product (Phase 16, plan2 §4.5).
 * Tenant-scoped: every row carries a `store_id` and ALL queries MUST scope by it.
 *
 * The quantity_* counters are denormalized convenience values; they are NOT the
 * security-critical source of truth for assignment — the `digital_codes` rows
 * are (plan2 §4.5). Treat them as best-effort aggregates maintained
 * transactionally by the import/assignment paths in later work.
 *
 * `supplier_id` is intentionally a plain uuid column WITHOUT a foreign key here:
 * the `suppliers` table is introduced in Phase 20, which adds the FK then (plan2
 * §20). It stays nullable until suppliers exist.
 */
export const codeBatches = pgTable(
  "code_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Linked to the supplier the batch was purchased from (Phase 20). SET NULL on
    // supplier deletion so cost history survives.
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    batchName: text("batch_name"),
    source: text("source").notNull().default("manual_import"),
    importFileName: text("import_file_name"),
    // Denormalized counters (best-effort; digital_codes rows are authoritative).
    quantityTotal: integer("quantity_total").notNull().default(0),
    quantityAvailable: integer("quantity_available").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    quantitySold: integer("quantity_sold").notNull().default(0),
    quantityDelivered: integer("quantity_delivered").notNull().default(0),
    quantityInvalid: integer("quantity_invalid").notNull().default(0),
    // Exact decimal money. cost_per_code carries extra scale for small unit costs.
    costTotal: numeric("cost_total", { precision: 12, scale: 2 }),
    costPerCode: numeric("cost_per_code", { precision: 12, scale: 4 }),
    currency: text("currency"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
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
    storeProductIdx: index("code_batches_store_product_idx").on(
      table.storeId,
      table.productId,
    ),
    storeSupplierIdx: index("code_batches_store_supplier_idx").on(
      table.storeId,
      table.supplierId,
    ),
    storeStatusIdx: index("code_batches_store_status_idx").on(
      table.storeId,
      table.status,
    ),
    // Backs the tenant listing + deterministic newest-first sort (id tiebreaker).
    storeCreatedIdx: index("code_batches_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type CodeBatchRow = typeof codeBatches.$inferSelect;
export type NewCodeBatchRow = typeof codeBatches.$inferInsert;
