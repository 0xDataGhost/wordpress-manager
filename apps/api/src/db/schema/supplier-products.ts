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
import { products } from "./products";
import { stores } from "./stores";
import { suppliers } from "./suppliers";

/**
 * Mapping of which products a supplier provides, with the agreed cost basis
 * (Phase 20, plan2 §4.4). Tenant-scoped — every row carries a `store_id` and ALL
 * queries MUST scope by it. A supplier maps a product at most once (unique index).
 */
export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierSku: text("supplier_sku"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
    currency: text("currency"),
    minOrderQuantity: integer("min_order_quantity"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeSupplierProductUnique: uniqueIndex(
      "supplier_products_store_supplier_product_unique",
    ).on(table.storeId, table.supplierId, table.productId),
    storeSupplierIdx: index("supplier_products_store_supplier_idx").on(
      table.storeId,
      table.supplierId,
    ),
    storeProductIdx: index("supplier_products_store_product_idx").on(
      table.storeId,
      table.productId,
    ),
  }),
);

export type SupplierProductRow = typeof supplierProducts.$inferSelect;
export type NewSupplierProductRow = typeof supplierProducts.$inferInsert;
