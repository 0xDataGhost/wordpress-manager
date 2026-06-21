import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { DbTransaction } from "../../db";
import { db } from "../../db";
import { roles } from "../../db/schema/roles";
import { storeUsers } from "../../db/schema/store-users";
import { stores, type StoreRow } from "../../db/schema/stores";
import { userRoles } from "../../db/schema/user-roles";
import { OWNER_ROLE_SLUG } from "../../config/rbac";

function baseSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");
  return slug || "store";
}

async function generateUniqueSlug(
  tx: DbTransaction,
  name: string,
): Promise<string> {
  const base = baseSlug(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const existing = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}-${randomUUID()}`;
}

/**
 * Creates a store (tenant) and provisions its creator as owner: store row,
 * membership, and an assignment of the seeded "owner" system role. Runs inside
 * the caller's transaction so registration stays atomic.
 */
export async function createStoreWithOwner(
  tx: DbTransaction,
  params: { name: string; ownerUserId: string },
): Promise<StoreRow> {
  const slug = await generateUniqueSlug(tx, params.name);

  const [store] = await tx
    .insert(stores)
    .values({ name: params.name, slug, ownerUserId: params.ownerUserId })
    .returning();

  if (!store) {
    throw new Error("Failed to create store");
  }

  await tx.insert(storeUsers).values({
    storeId: store.id,
    userId: params.ownerUserId,
  });

  const [ownerRole] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.slug, OWNER_ROLE_SLUG), isNull(roles.storeId)))
    .limit(1);

  if (!ownerRole) {
    throw new Error(
      'Owner system role is not seeded. Run "npm run db:seed" first.',
    );
  }

  await tx.insert(userRoles).values({
    userId: params.ownerUserId,
    storeId: store.id,
    roleId: ownerRole.id,
  });

  return store;
}

export async function getStoreById(storeId: string): Promise<StoreRow | null> {
  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  return store ?? null;
}
