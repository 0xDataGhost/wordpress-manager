import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { permissions } from "../../db/schema/permissions";
import { rolePermissions } from "../../db/schema/role-permissions";
import { roles } from "../../db/schema/roles";
import { userRoles } from "../../db/schema/user-roles";

/**
 * Resolves the distinct permission keys a user holds within a given store.
 * This is the heart of permission-based authorization: (user, store) -> roles
 * -> permissions.
 */
export async function loadPermissionKeys(
  userId: string,
  storeId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), eq(userRoles.storeId, storeId)));

  return rows.map((row) => row.key);
}

/** Resolves the distinct role slugs a user holds within a given store. */
export async function loadRoleSlugs(
  userId: string,
  storeId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(userRoles.storeId, storeId)));

  return rows.map((row) => row.slug);
}
