import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { users } from "./users";

/**
 * Canonical audit actions. `action` stays free text in the database (so new
 * tracked actions can be added without a migration), but this object is the
 * source of truth used at every call site and by the dashboard's labels. Using
 * an object (not a bare string list) gives compile-time safety: a typo at a call
 * site is a type error.
 */
export const AUDIT_ACTIONS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  PRODUCT_ARCHIVED: "product.archived",
  ORDER_NOTES_UPDATED: "order.notes_updated",
  CUSTOMER_NOTES_UPDATED: "customer.notes_updated",
  SETTINGS_UPDATED: "settings.updated",
  AUTOMATION_ENABLED: "automation.enabled",
  AUTOMATION_DISABLED: "automation.disabled",
  AUTOMATION_CONFIG_UPDATED: "automation.config_updated",
  CONNECTION_CHANGED: "connection.changed",
  SYNC_STARTED: "sync.started",
  SYNC_COMPLETED: "sync.completed",
  SYNC_FAILED: "sync.failed",
  WEBHOOK_PROCESSED: "webhook.processed",
  WEBHOOK_FAILED: "webhook.failed",
  AI_USED: "ai.used",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Every action string, for the dashboard's action filter and validation. */
export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS);

/**
 * Canonical entity families an audit log can reference. Free text in the
 * database; this object is the source of truth for the entity-type filter.
 */
export const AUDIT_ENTITY_TYPES = {
  USER: "user",
  PRODUCT: "product",
  ORDER: "order",
  CUSTOMER: "customer",
  SETTINGS: "settings",
  AUTOMATION: "automation",
  CONNECTION: "connection",
  SYNC: "sync",
  WEBHOOK: "webhook",
  AI: "ai",
} as const;

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];

/** Every entity-type string, for the dashboard's filter and validation. */
export const AUDIT_ENTITY_TYPE_VALUES = Object.values(AUDIT_ENTITY_TYPES);

/**
 * Tenant-scoped audit trail of important write / security / system actions
 * (Phase 13.5). Every row carries a `store_id` and ALL queries MUST scope by it
 * — there is no cross-store read. The table is append-only in practice: writes
 * happen through a best-effort recorder so a logging failure can never break the
 * action it describes, and it is never written for plain read requests.
 *
 * Security: audit logs MUST NOT store sensitive data — no passwords, tokens, API
 * keys, raw webhook payloads, or raw AI prompts. `metadata` carries only
 * non-sensitive structured context (ids, counts, changed-field names, …).
 *
 * `user_id` is nullable: system actions (webhook processing, connector-driven
 * connection/sync changes) have no acting dashboard user. It references `users`
 * with ON DELETE SET NULL so a removed user does not erase the historical trail.
 * `entity_id` is text (not uuid) because the referenced entity id varies by
 * family (catalog uuid, sync-job uuid, WooCommerce external id, …).
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // The acting dashboard user, or null for system/connector-driven actions.
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // One of AUDIT_ACTIONS (free text to tolerate future kinds).
    action: text("action").notNull(),
    // One of AUDIT_ENTITY_TYPES (free text).
    entityType: text("entity_type").notNull(),
    // Id of the affected entity (uuid or external id), or null.
    entityId: text("entity_id"),
    // Short human-readable Arabic summary of what happened.
    message: text("message").notNull(),
    // Non-sensitive structured context only (ids, counts, changed fields).
    metadata: jsonb("metadata"),
    // Best-effort request context; null for actions without an HTTP request.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Backs the tenant-scoped list and its deterministic newest-first sort
    // (created_at desc, id desc).
    storeCreatedIdx: index("audit_logs_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
    // Back the optional filters (always combined with store_id).
    storeActionIdx: index("audit_logs_store_action_idx").on(
      table.storeId,
      table.action,
    ),
    storeEntityIdx: index("audit_logs_store_entity_idx").on(
      table.storeId,
      table.entityType,
    ),
    storeUserIdx: index("audit_logs_store_user_idx").on(
      table.storeId,
      table.userId,
    ),
  }),
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
