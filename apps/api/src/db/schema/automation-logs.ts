import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { automations } from "./automations";
import { stores } from "./stores";

/**
 * Outcome of a single automation run. `success` ran and did something,
 * `skipped` ran but had nothing to do (or the automation was disabled),
 * `queued` enqueued a background job (the WhatsApp placeholder), and `failed`
 * threw. Free text backed by this list.
 */
export const AUTOMATION_LOG_STATUSES = [
  "success",
  "skipped",
  "queued",
  "failed",
] as const;
export type AutomationLogStatus = (typeof AUTOMATION_LOG_STATUSES)[number];

/**
 * Append-only audit of automation runs for a single store (tenant). Every row
 * carries a `store_id` and all queries MUST scope by it. `automation_id` links
 * to the automation that produced the log; `type` is denormalized for cheap
 * filtering. `metadata` (jsonb) carries the structured run result (counts,
 * thresholds, rendered messages, …) for the dashboard.
 */
export const automationLogs = pgTable(
  "automation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    // Denormalized automation type (one of AUTOMATION_TYPES).
    type: text("type").notNull(),
    // One of AUTOMATION_LOG_STATUSES.
    status: text("status").notNull(),
    // Human-readable summary of the run.
    message: text("message"),
    // Structured run result for the UI (counts, thresholds, rendered message …).
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Backs the per-automation logs list and its newest-first sort.
    storeAutomationCreatedIdx: index(
      "automation_logs_store_automation_created_idx",
    ).on(table.storeId, table.automationId, table.createdAt, table.id),
  }),
);

export type AutomationLogRow = typeof automationLogs.$inferSelect;
export type NewAutomationLogRow = typeof automationLogs.$inferInsert;
