import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** What a sync job covers. "all" runs products, orders and customers in turn. */
export const SYNC_ENTITY_TYPES = [
  "product",
  "order",
  "customer",
  "all",
] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

/** Lifecycle of a sync job. */
export const SYNC_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

/** What triggered the sync. */
export const SYNC_TRIGGERS = ["dashboard", "wordpress"] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

/**
 * A record of one manual sync run, tenant-scoped by `store_id`. Captures the
 * outcome counts so the dashboard and `GET /sync/status` can report progress and
 * the last result. In this phase syncs run synchronously inside the request, but
 * the row is written first (status "running") and finalised after, so the model
 * already supports a future BullMQ worker updating it asynchronously.
 */
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // "product" | "order" | "customer" | "all".
    entityType: text("entity_type").notNull(),
    source: text("source").notNull().default("woocommerce"),
    // "dashboard" | "wordpress".
    trigger: text("trigger").notNull().default("dashboard"),
    // "queued" | "running" | "completed" | "failed".
    status: text("status").notNull().default("queued"),
    total: integer("total").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    // User-facing error message when status is "failed".
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Most-recent-first listing per store for GET /sync/status.
    storeRecentIdx: index("sync_jobs_store_recent_idx").on(
      table.storeId,
      table.createdAt,
    ),
  }),
);

export type SyncJobRow = typeof syncJobs.$inferSelect;
export type NewSyncJobRow = typeof syncJobs.$inferInsert;
