import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * WooCommerce configuration snapshots (Phase 30, plan3 §4.2). One row per
 * (store, group): a jsonb of the allowlisted, secret-stripped fields the
 * connector returned, plus when it was fetched. This is a READ MODEL only —
 * WordPress remains the source of truth; the dashboard writes via the command
 * outbox and re-pulls the group.
 *
 * `group` is one of: general, products, tax, shipping_zones, tax_rates,
 * gateways. Gateway rows NEVER contain secret fields (the connector strips
 * them; plan3 §2.3).
 */
export const storeConfigSnapshots = pgTable(
  "store_config_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    group: text("group").notNull(),
    // Allowlisted, secret-stripped payload for the group.
    data: jsonb("data"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeGroupUnique: uniqueIndex("store_config_snapshots_store_group_unique").on(
      table.storeId,
      table.group,
    ),
    storeIdx: index("store_config_snapshots_store_idx").on(table.storeId),
  }),
);

export type StoreConfigSnapshotRow = typeof storeConfigSnapshots.$inferSelect;
export type NewStoreConfigSnapshotRow =
  typeof storeConfigSnapshots.$inferInsert;
