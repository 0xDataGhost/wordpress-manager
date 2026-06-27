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
export const CLASSIC_AUTOMATION_TYPES = [
  "low_stock_alert",
  "daily_sales_report",
  "whatsapp_order_message",
] as const;

/**
 * The Phase 23 digital-product automations (plan2 §23). Note: the plan lists a
 * seventh type `digital_supplier_quality_alert`; it is intentionally OUT OF SCOPE
 * for this phase and not implemented here.
 *
 * As with the classic types, `enabled` is modelled as the automation row's
 * `enabled` COLUMN (the operational switch), not a config key — the plan's
 * per-automation `enabled` field maps to that column, mirroring how the Phase 11
 * automations work. Each type's remaining config is validated per-type in the
 * service (see automations.config).
 */
export const DIGITAL_AUTOMATION_TYPES = [
  "digital_low_stock_alert",
  "digital_out_of_stock_alert",
  "digital_failed_delivery_alert",
  "digital_replacement_rate_alert",
  "auto_assign_codes_on_paid_order",
  "auto_deliver_codes_on_paid_order",
] as const;
export type DigitalAutomationType = (typeof DIGITAL_AUTOMATION_TYPES)[number];

export const AUTOMATION_TYPES = [
  ...CLASSIC_AUTOMATION_TYPES,
  ...DIGITAL_AUTOMATION_TYPES,
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
