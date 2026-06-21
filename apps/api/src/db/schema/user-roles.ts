import { pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { stores } from "./stores";
import { users } from "./users";

/**
 * Per-store role assignment. A user's permissions are always resolved in the
 * context of a specific store (tenant): (user_id, store_id) -> role -> perms.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userStoreRoleUnique: uniqueIndex("user_roles_user_store_role_unique").on(
      table.userId,
      table.storeId,
      table.roleId,
    ),
  }),
);

export type UserRoleRow = typeof userRoles.$inferSelect;
export type NewUserRoleRow = typeof userRoles.$inferInsert;
