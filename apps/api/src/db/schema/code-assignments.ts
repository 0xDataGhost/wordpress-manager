import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { digitalCodes } from "./digital-codes";
import { orderItems } from "./order-items";
import { orders } from "./orders";
import { products } from "./products";
import { stores } from "./stores";
import { users } from "./users";

/**
 * How a code came to be assigned (plan2 §4.7). Phase 17 only produces `sale`
 * (engine/manual auto-assignment); `manual`/`replacement`/`resend` are reserved
 * for the Phase 19 support tools. Free text backed by this list.
 */
export const ASSIGNMENT_TYPES = [
  "sale",
  "manual",
  "replacement",
  "resend",
] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/**
 * Lifecycle of an assignment row (plan2 §4.7). Phase 17 creates `assigned`;
 * delivery (Phase 18) moves it to `delivered`; the rest belong to later phases.
 * `assigned` and `delivered` are the "active" states that hold a code.
 */
export const ASSIGNMENT_STATUSES = [
  "assigned",
  "delivered",
  "replaced",
  "refunded",
  "cancelled",
  "failed",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Statuses in which an assignment actively holds its code (blocks reuse). */
export const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "delivered"] as const;

/**
 * Records which digital code was assigned to which order/order item (Phase 17,
 * plan2 §4.7). Tenant-scoped: every row carries a `store_id` and ALL queries MUST
 * scope by it. This table — not the batch counters — is the authoritative record
 * of code ⇄ order links and the basis for the double-sell guard.
 *
 * DEVIATION from §4.7 (documented): `order_item_id` is nullable with ON DELETE
 * SET NULL rather than NOT NULL + CASCADE. The order sync replaces an order's
 * `order_items` wholesale on every re-sync (new UUIDs), so a cascade would erase
 * assignment history on any `order.updated` webhook. The stable `order_id` +
 * `product_id` are the accounting keys; `order_item_id` is a best-effort link.
 * `code_id` uses ON DELETE RESTRICT so an assigned code can never be hard-deleted.
 */
export const codeAssignments = pgTable(
  "code_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // The assigned code. RESTRICT: an assigned code must never be hard-deleted.
    codeId: uuid("code_id")
      .notNull()
      .references(() => digitalCodes.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Best-effort link to the originating line item; SET NULL because order items
    // are replaced wholesale on re-sync (see deviation note above).
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    assignmentType: text("assignment_type").notNull().default("sale"),
    status: text("status").notNull().default("assigned"),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Self-reference for replacement chains (Phase 19).
    replacedByAssignmentId: uuid("replaced_by_assignment_id").references(
      (): AnyPgColumn => codeAssignments.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    metadata: jsonb("metadata")
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
    // Double-sell guard: a code can have at most ONE active (assigned/delivered)
    // assignment. Partial unique — replaced/refunded/cancelled/failed rows do not
    // block a fresh assignment of the same code (e.g. after a Phase 19 release).
    activeCodeUnique: uniqueIndex("code_assignments_active_code_unique")
      .on(table.storeId, table.codeId)
      .where(sql`${table.status} in ('assigned','delivered')`),
    storeOrderIdx: index("code_assignments_store_order_idx").on(
      table.storeId,
      table.orderId,
    ),
    storeOrderItemIdx: index("code_assignments_store_order_item_idx").on(
      table.storeId,
      table.orderItemId,
    ),
    storeCustomerIdx: index("code_assignments_store_customer_idx").on(
      table.storeId,
      table.customerId,
    ),
    storeProductIdx: index("code_assignments_store_product_idx").on(
      table.storeId,
      table.productId,
    ),
    storeCreatedIdx: index("code_assignments_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
    // Migration 0018: replacement-rate automation and profit-report date-range queries.
    storeAssignedAtIdx: index("code_assignments_store_assigned_at_idx").on(
      table.storeId,
      table.assignedAt,
    ),
  }),
);

export type CodeAssignmentRow = typeof codeAssignments.$inferSelect;
export type NewCodeAssignmentRow = typeof codeAssignments.$inferInsert;
