import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { orders } from "./orders";
import { stores } from "./stores";
import { users } from "./users";

/**
 * Customer self-service access tokens (Phase 22, plan2 §22). A staff-generated
 * signed link lets a customer view the digital codes they purchased without
 * logging in. Tenant-scoped: every row carries a `store_id` and ALL queries MUST
 * scope by it.
 *
 * SECURITY — digital codes are money:
 *   - Only the keyed HMAC-SHA256 `token_hash` is stored. The raw token exists only
 *     in the link handed to the customer; it is NEVER stored or logged.
 *   - `expires_at` bounds the link's lifetime; `revoked_at` kills it immediately.
 *   - `max_uses` caps the number of code reveals (null = unlimited within expiry);
 *     `used_count` is incremented atomically on each reveal to prevent races.
 *   - Only ONE active token may exist per order — generating a new link revokes
 *     all previously-active tokens for that order (enforced in the service).
 */
export const customerAccessTokens = pgTable(
  "customer_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    // HMAC-SHA256(CUSTOMER_TOKEN_HASH_KEY, rawToken) hex. Raw token NEVER stored.
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // null = unlimited reveals within the expiry window.
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex(
      "customer_access_tokens_token_hash_unique",
    ).on(table.tokenHash),
    storeOrderIdx: index("customer_access_tokens_store_order_idx").on(
      table.storeId,
      table.orderId,
    ),
    expiresIdx: index("customer_access_tokens_expires_idx").on(table.expiresAt),
  }),
);

export type CustomerAccessTokenRow = typeof customerAccessTokens.$inferSelect;
export type NewCustomerAccessTokenRow =
  typeof customerAccessTokens.$inferInsert;
