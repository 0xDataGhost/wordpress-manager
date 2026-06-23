import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * Per-store settings (tenant-scoped). Exactly one row per store — enforced by
 * the unique `store_id` index — lazily provisioned with safe defaults the first
 * time a store reads or updates its settings. All queries MUST scope by
 * `store_id`; there is no cross-store read.
 *
 * Settings live in a single generic `data` jsonb column (categories: general,
 * notifications, dashboard, branding) validated by the module's Zod schemas. The
 * column stays generic so future phases can add settings keys/categories without
 * a migration; the service validates the shape and fills defaults.
 */
export const storeSettings = pgTable(
  "store_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope — one settings row per store.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Structured settings payload; validated by settings.schemas.
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Exactly one settings row per store. Also backs the provisioning upsert
    // (onConflictDoNothing on this target).
    storeUnique: uniqueIndex("store_settings_store_unique").on(table.storeId),
  }),
);

export type StoreSettingsRow = typeof storeSettings.$inferSelect;
export type NewStoreSettingsRow = typeof storeSettings.$inferInsert;
