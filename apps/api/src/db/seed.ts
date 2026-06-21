import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { PERMISSIONS, SYSTEM_ROLES } from "../config/rbac";
import { closeDatabase, db } from "./index";
import { permissions } from "./schema/permissions";
import { rolePermissions } from "./schema/role-permissions";
import { roles } from "./schema/roles";

/**
 * Idempotently materialises the RBAC catalog from config/rbac.ts into the
 * database: the permission keys, the seeded system roles (store_id NULL), and
 * each role's permission grants. Safe to run repeatedly.
 */
async function seed(): Promise<void> {
  console.log("Seeding RBAC catalog...");

  await db.transaction(async (tx) => {
    // 1. Upsert permission keys.
    await tx
      .insert(permissions)
      .values(
        PERMISSIONS.map((p) => ({ key: p.key, description: p.description })),
      )
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: sql`excluded.description` },
      });

    const permissionRows = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions);
    const permissionIdByKey = new Map(
      permissionRows.map((row) => [row.key, row.id]),
    );

    // 2. Upsert each system role (store_id NULL) and reconcile its grants.
    for (const def of SYSTEM_ROLES) {
      const [existing] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.slug, def.slug), isNull(roles.storeId)))
        .limit(1);

      let roleId: string;
      if (existing) {
        roleId = existing.id;
        await tx
          .update(roles)
          .set({
            name: def.name,
            description: def.description,
            isSystem: true,
            updatedAt: new Date(),
          })
          .where(eq(roles.id, roleId));
      } else {
        const [created] = await tx
          .insert(roles)
          .values({
            storeId: null,
            name: def.name,
            slug: def.slug,
            description: def.description,
            isSystem: true,
          })
          .returning({ id: roles.id });
        if (!created) {
          throw new Error(`Failed to create system role "${def.slug}"`);
        }
        roleId = created.id;
      }

      // Reconcile grants: clear then insert the exact permission set.
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      const grants = def.permissions.map((key) => {
        const permissionId = permissionIdByKey.get(key);
        if (!permissionId) {
          throw new Error(
            `Permission "${key}" referenced by role "${def.slug}" is not in the catalog`,
          );
        }
        return { roleId, permissionId };
      });

      if (grants.length > 0) {
        await tx.insert(rolePermissions).values(grants);
      }

      console.log(`  ✓ ${def.slug} (${def.permissions.length} permissions)`);
    }
  });

  console.log(
    `Seed complete: ${PERMISSIONS.length} permissions, ${SYSTEM_ROLES.length} system roles.`,
  );
}

seed()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await closeDatabase();
    process.exit(1);
  });
