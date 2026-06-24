import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { users } from "./users";

/** Membership join: which users belong to which stores (tenants). */
export const storeUsers = pgTable(
  "store_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeUserUnique: uniqueIndex("store_users_store_user_unique").on(
      table.storeId,
      table.userId,
    ),
    // Backs "which stores does this user belong to?" and the ON DELETE CASCADE
    // check when a user is deleted (user_id is the non-leading column above).
    userIdx: index("store_users_user_idx").on(table.userId),
  }),
);

export type StoreUserRow = typeof storeUsers.$inferSelect;
export type NewStoreUserRow = typeof storeUsers.$inferInsert;
