import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { users } from "./users";

/**
 * One row per issued refresh token (the row id is the JWT `jti`). Rotation
 * revokes the presented token and links it to its successor via
 * `replaced_by_id`, enabling reuse detection.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Active tenant context captured when the token was issued.
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_idx").on(table.userId),
  }),
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
