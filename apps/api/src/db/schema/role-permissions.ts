import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
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
    // Backs the reverse "which roles grant permission X?" lookup and the
    // ON DELETE CASCADE check when a permission is removed. The composite PK
    // already covers role_id as its leading column.
    permissionIdx: index("role_permissions_permission_idx").on(
      table.permissionId,
    ),
  }),
);

export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type NewRolePermissionRow = typeof rolePermissions.$inferInsert;
