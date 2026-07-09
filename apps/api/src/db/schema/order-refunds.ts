import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { orders } from "./orders";
import { users } from "./users";

/** Who initiated a refund: the dashboard (via a command) or wp-admin. */
export const REFUND_INITIATORS = ["saas", "woocommerce"] as const;
export type RefundInitiator = (typeof REFUND_INITIATORS)[number];

/**
 * Mirror of WooCommerce order refunds (Phase 27, plan3 §4.2). Rows arrive from
 * two directions and converge on (store_id, wp_refund_id):
 *  - a successful SaaS refund command inserts its row immediately (initiated_by
 *    "saas", created_by = acting user);
 *  - webhook/sync upserts insert rows for wp-admin refunds (initiated_by
 *    "woocommerce") and refresh amounts, never overwriting initiated_by.
 *
 * `refunded_payment` records whether money moved at the gateway — the
 * money-sensitive flag audits and reports care about.
 */
export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // WooCommerce refund id (the refund is a WP post).
    wpRefundId: integer("wp_refund_id"),
    amount: numeric("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("SAR"),
    reason: text("reason"),
    // True when the gateway was instructed to move money back.
    refundedPayment: boolean("refunded_payment").notNull().default(false),
    // "saas" | "woocommerce" — set on insert, never flipped by sync.
    initiatedBy: text("initiated_by").notNull().default("woocommerce"),
    // Acting dashboard user for SaaS-initiated refunds; null otherwise.
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    // Refund creation time reported by WooCommerce.
    wpDateCreated: timestamp("wp_date_created", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeWpRefundUnique: uniqueIndex("order_refunds_store_wp_refund_unique")
      .on(table.storeId, table.wpRefundId)
      .where(sql`${table.wpRefundId} is not null`),
    storeOrderIdx: index("order_refunds_store_order_idx").on(
      table.storeId,
      table.orderId,
    ),
  }),
);

export type OrderRefundRow = typeof orderRefunds.$inferSelect;
export type NewOrderRefundRow = typeof orderRefunds.$inferInsert;
