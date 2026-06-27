import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { codeAssignments } from "./code-assignments";
import { customerAccessTokens } from "./customer-access-tokens";
import { customers } from "./customers";
import { digitalCodes } from "./digital-codes";
import { orders } from "./orders";
import { stores } from "./stores";
import { users } from "./users";

/** What a recorded customer code view represents (Phase 22). */
export const CUSTOMER_VIEW_ACTIONS = ["viewed", "copied"] as const;
export type CustomerViewAction = (typeof CUSTOMER_VIEW_ACTIONS)[number];

/** Who triggered the view. Public self-service is always `customer`. */
export const CUSTOMER_VIEWER_TYPES = ["customer", "staff", "system"] as const;
export type CustomerViewerType = (typeof CUSTOMER_VIEWER_TYPES)[number];

/**
 * Records every customer access to a delivered digital code (Phase 22,
 * plan2 §4.10) — one row per code per `viewed`/`copied` action. Tenant-scoped:
 * every row carries a `store_id` and ALL queries MUST scope by it.
 *
 * SECURITY: this is an access LOG. It NEVER stores the code value, cipher, or any
 * secret — only ids, the action, and best-effort request context (ip / user
 * agent) for abuse forensics. This is the single self-service analytics table
 * (no separate analytics table is created).
 */
export const customerCodeViews = pgTable(
  "customer_code_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    codeId: uuid("code_id")
      .notNull()
      .references(() => digitalCodes.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => codeAssignments.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    tokenId: uuid("token_id").references(() => customerAccessTokens.id, {
      onDelete: "set null",
    }),
    // Null for customer/system views; set only for staff-originated views.
    viewerUserId: uuid("viewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // One of CUSTOMER_VIEWER_TYPES (free text backed by the list).
    viewerType: text("viewer_type").notNull(),
    // One of CUSTOMER_VIEW_ACTIONS (free text backed by the list).
    action: text("action").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeCodeIdx: index("customer_code_views_store_code_idx").on(
      table.storeId,
      table.codeId,
    ),
    storeOrderIdx: index("customer_code_views_store_order_idx").on(
      table.storeId,
      table.orderId,
    ),
    storeCreatedIdx: index("customer_code_views_store_created_idx").on(
      table.storeId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type CustomerCodeViewRow = typeof customerCodeViews.$inferSelect;
export type NewCustomerCodeViewRow = typeof customerCodeViews.$inferInsert;
