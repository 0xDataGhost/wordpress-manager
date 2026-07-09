import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { users } from "./users";

/**
 * Lifecycle of an outbound SaaS -> WordPress command (Phase 25, plan3 §4.1).
 *
 *  pending   — recorded, not attempted yet (or queued for retry)
 *  sending   — an attempt is in flight
 *  succeeded — the connector confirmed the mutation
 *  conflict  — compare-and-set failed: WordPress has a newer version (409)
 *  failed    — the last attempt errored; retryable from the Command Center
 *  dead      — exhausted retries / permanently rejected; manual attention
 */
export const WP_COMMAND_STATUSES = [
  "pending",
  "sending",
  "succeeded",
  "conflict",
  "failed",
  "dead",
] as const;
export type WpCommandStatus = (typeof WP_COMMAND_STATUSES)[number];

/** Entity families a command can target (grows per plan3 phase). */
export const WP_COMMAND_DOMAINS = [
  "product",
  "order",
  "coupon",
  "customer",
  "review",
  "settings",
  "shipping",
  "tax",
  "media",
  "taxonomy",
] as const;
export type WpCommandDomain = (typeof WP_COMMAND_DOMAINS)[number];

/**
 * The command outbox: every SaaS -> WordPress mutation is recorded here BEFORE
 * it is attempted and updated with the outcome. This is the single write path
 * to WordPress (plan3 §2.1) — modules never call wp-client directly for writes.
 *
 * Idempotency: `idempotency_key` is unique per store and is sent to the
 * connector on every attempt, so a retry of the same command can never apply
 * the mutation twice. Echo suppression: the command id travels to WordPress as
 * X-Saas-Command-Id and comes back on the webhooks the mutation fires, letting
 * the webhook handler confirm the command instead of re-processing its echo.
 *
 * Security: `payload` stores the normalized request body sent to the connector.
 * Callers MUST NOT place secrets in payloads (there are none in the supported
 * domains — gateway secrets never flow through the SaaS, plan3 §2.3).
 */
export const wpCommands = pgTable(
  "wp_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Unique per store; sent to the connector on every attempt.
    idempotencyKey: text("idempotency_key").notNull(),
    // One of WP_COMMAND_DOMAINS (free text to tolerate future kinds).
    domain: text("domain").notNull(),
    // Verb within the domain, e.g. "create", "update_status", "create_refund".
    action: text("action").notNull(),
    // WooCommerce entity id when known (null for creates until confirmed).
    targetWpId: integer("target_wp_id"),
    // Normalized request body sent to the connector. Never secrets.
    payload: jsonb("payload"),
    // Compare-and-set token (the entity date_modified the SaaS last saw).
    expectedVersion: text("expected_version"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Sanitized message of the last failure; never raw payload dumps.
    lastError: text("last_error"),
    // Normalized connector response data on success.
    result: jsonb("result"),
    // Acting dashboard user; null for automation/system-originated commands.
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("wp_commands_store_idempotency_unique").on(
      table.storeId,
      table.idempotencyKey,
    ),
    // Money-safety (Phase 32 audit fix): at most ONE in-flight refund command
    // per order at the DB level. A concurrent second refund submit for the
    // same order loses the unique race and is rejected as a conflict, so two
    // requests can never both pass a check-then-act guard and double-refund.
    refundInFlightUnique: uniqueIndex("wp_commands_refund_in_flight_unique")
      .on(table.storeId, table.targetWpId)
      .where(
        sql`${table.domain} = 'order' and ${table.action} = 'create_refund' and ${table.status} in ('pending','sending')`,
      ),
    storeStatusIdx: index("wp_commands_store_status_idx").on(
      table.storeId,
      table.status,
    ),
    storeDomainTargetIdx: index("wp_commands_store_domain_target_idx").on(
      table.storeId,
      table.domain,
      table.targetWpId,
    ),
    // Backs the newest-first Command Center list.
    storeCreatedIdx: index("wp_commands_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type WpCommandRow = typeof wpCommands.$inferSelect;
export type NewWpCommandRow = typeof wpCommands.$inferInsert;
