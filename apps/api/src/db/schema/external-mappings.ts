import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** Local entity kinds that can be mapped to an external system. */
export const MAPPING_ENTITY_TYPES = ["product", "order", "customer"] as const;
export type MappingEntityType = (typeof MAPPING_ENTITY_TYPES)[number];

/** External systems a local entity can be mapped to. */
export const MAPPING_SOURCES = ["woocommerce"] as const;
export type MappingSource = (typeof MAPPING_SOURCES)[number];

/**
 * One generic mapping table linking a local SaaS entity (product/order/customer)
 * to its id in an external system (WooCommerce). Replaces per-entity mapping
 * tables. Every row is tenant-scoped by `store_id`. The pair
 * (store_id, entity_type, source, external_id) is unique so a given external
 * record maps to exactly one local row, which is what makes repeated syncs
 * idempotent. `local_id` is the uuid of the row in the corresponding table; it
 * is not a hard FK because it is polymorphic across three tables.
 */
export const externalMappings = pgTable(
  "external_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // "product" | "order" | "customer".
    entityType: text("entity_type").notNull(),
    // The uuid of the local row in the matching table (polymorphic, no FK).
    localId: uuid("local_id").notNull(),
    // The id of the record in the external system (kept as text: Woo ids are
    // numeric but other sources may not be).
    externalId: text("external_id").notNull(),
    // "woocommerce".
    source: text("source").notNull().default("woocommerce"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // An external record maps to exactly one local row per store/entity/source.
    externalUnique: uniqueIndex("external_mappings_external_unique").on(
      table.storeId,
      table.entityType,
      table.source,
      table.externalId,
    ),
    // Fast reverse lookup: given a local row, find its external id.
    localLookup: index("external_mappings_local_idx").on(
      table.storeId,
      table.entityType,
      table.localId,
    ),
  }),
);

export type ExternalMappingRow = typeof externalMappings.$inferSelect;
export type NewExternalMappingRow = typeof externalMappings.$inferInsert;
