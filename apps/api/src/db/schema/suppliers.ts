import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * Supplier lifecycle (plan2 §4.3). `status` is free text backed by this list.
 * Only `active` suppliers may receive new code imports.
 */
export const SUPPLIER_STATUSES = ["active", "paused", "archived"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/**
 * Suppliers / vendors a store buys digital codes from (Phase 20, plan2 §4.3).
 * Tenant-scoped: every row carries a `store_id` and ALL queries MUST scope by it.
 * The accounting foundation — every batch and code can trace back to a supplier.
 *
 * `is_preferred` marks the store's default supplier (at most one per store,
 * enforced by the service). Supplier names are unique per store (case-insensitive)
 * via the unique index below.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    country: text("country"),
    currency: text("currency"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // No two suppliers share a name within a store (case-insensitive).
    storeNameUnique: uniqueIndex("suppliers_store_name_unique").on(
      table.storeId,
      sql`lower(${table.name})`,
    ),
    storeStatusIdx: index("suppliers_store_status_idx").on(
      table.storeId,
      table.status,
    ),
  }),
);

export type SupplierRow = typeof suppliers.$inferSelect;
export type NewSupplierRow = typeof suppliers.$inferInsert;
