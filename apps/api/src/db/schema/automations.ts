import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * The Phase 11 automations. The `type` column stays free text (so future
 * automations can be introduced without a migration), but this list is the
 * source of truth for provisioning, config validation and the dashboard labels.
 */
export const AUTOMATION_TYPES = [
  "low_stock_alert",
  "daily_sales_report",
  "whatsapp_order_message",
] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

/**
 * Per-store automation settings (tenant-scoped). Every row carries a `store_id`
 * and all queries MUST scope by it — there is no cross-store read. A store has
 * at most one row per `type` (the `(store_id, type)` unique index), and the rows
 * are lazily provisioned with defaults the first time a store reads or runs them.
 *
 * `config` (jsonb) holds the per-type settings (e.g. `{ threshold }` for low
 * stock, `{ time }` for the daily report, `{ message_template }` for WhatsApp).
 * It stays generic at the DB level; the service validates the shape per type.
 */
export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // One of AUTOMATION_TYPES (free text to tolerate future kinds).
    type: text("type").notNull(),
    // Whether the automation is active. Disabled automations never fire.
    enabled: boolean("enabled").notNull().default(false),
    // Per-type settings; validated by the service against the type's schema.
    config: jsonb("config")
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
    // Each store has exactly one row per automation type. Also backs the lazy
    // provisioning upsert (onConflictDoNothing on this target).
    storeTypeUnique: uniqueIndex("automations_store_type_unique").on(
      table.storeId,
      table.type,
    ),
  }),
);

export type AutomationRow = typeof automations.$inferSelect;
export type NewAutomationRow = typeof automations.$inferInsert;
