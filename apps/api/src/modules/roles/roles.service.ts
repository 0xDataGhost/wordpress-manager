import { eq, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { permissions } from "../../db/schema/permissions";
import { rolePermissions } from "../../db/schema/role-permissions";
import { roles, type RoleRow } from "../../db/schema/roles";

export interface RoleWithPermissions extends RoleRow {
  permissions: string[];
}

/**
 * Lists the roles visible to a store: the seeded system roles (store_id NULL)
 * plus any custom roles owned by this store, each with its permission keys.
 * A single left-joined query avoids an N+1 over role_permissions.
 */
export async function listRolesForStore(
  storeId: string,
): Promise<RoleWithPermissions[]> {
  const rows = await db
    .select({
      role: roles,
      permissionKey: permissions.key,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(or(isNull(roles.storeId), eq(roles.storeId, storeId)))
    .orderBy(roles.name);

  const byId = new Map<string, RoleWithPermissions>();
  for (const { role, permissionKey } of rows) {
    let entry = byId.get(role.id);
    if (!entry) {
      entry = { ...role, permissions: [] };
      byId.set(role.id, entry);
    }
    if (permissionKey) {
      entry.permissions.push(permissionKey);
    }
  }

  return [...byId.values()];
}
