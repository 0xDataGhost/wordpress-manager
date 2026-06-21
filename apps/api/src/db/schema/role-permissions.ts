import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { permissions } from "./permissions";
import { roles } from "./roles";

/** Join table mapping roles to the permissions they grant. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
  }),
);

export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type NewRolePermissionRow = typeof rolePermissions.$inferInsert;
