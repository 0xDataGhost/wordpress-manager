import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * Canonical notification types. The `type` column stays free text (so future
 * automations can introduce new kinds without a migration), but this list is the
 * source of truth for the dashboard's type labels and any seeding.
 */
export const NOTIFICATION_TYPES = [
  "new_order",
  "low_stock",
  "failed_sync",
  "failed_automation",
  "daily_report",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Severity drives the badge tone in the UI. Free text backed by this list. */
export const NOTIFICATION_SEVERITIES = [
  "info",
  "success",
  "warning",
  "error",
] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * System notifications for a single store (tenant). Every row carries a
 * `store_id` and all queries MUST scope by it — there is no cross-store read.
 * A notification is unread while `read_at` is null and read once it is set.
 *
 * The table is intentionally generic so future automations (low-stock alerts,
 * daily reports, failed-sync/automation messages) can write rows without any
 * schema change: `type` + `severity` stay free text backed by canonical lists,
 * and `metadata` (jsonb) carries any structured payload (order id, product id,
 * counts, …) for the UI or future deep links.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // One of NOTIFICATION_TYPES (free text to tolerate future kinds).
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    // One of NOTIFICATION_SEVERITIES; drives the badge tone in the UI.
    severity: text("severity").notNull().default("info"),
    // Null while unread; set to the read timestamp once acknowledged.
    readAt: timestamp("read_at", { withTimezone: true }),
    // Generic structured payload for future automations / deep links.
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Backs the tenant-scoped list and its deterministic newest-first sort
    // (created_at desc, id desc).
    storeCreatedIdx: index("notifications_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
    // Backs the unread count + unread filter. Partial: only unread rows.
    storeUnreadIdx: index("notifications_store_unread_idx")
      .on(table.storeId)
      .where(sql`${table.readAt} is null`),
  }),
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
