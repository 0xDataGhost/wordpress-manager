import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  storeSettings,
  type StoreSettingsRow,
} from "../../db/schema/settings";
import { stores } from "../../db/schema/stores";
import { ValidationError } from "../../lib/errors";
import {
  SETTINGS_DEFAULTS,
  mergeSettings,
  normalizeSettings,
  settingsSchema,
  type SettingsData,
  type UpdateSettingsInput,
} from "./settings.schemas";

/** Builds the initial settings payload, seeding names from the store record. */
function buildInitialData(storeName: string): SettingsData {
  return {
    ...SETTINGS_DEFAULTS,
    general: {
      ...SETTINGS_DEFAULTS.general,
      store_name: storeName,
      company_name: storeName,
    },
  };
}

/**
 * Idempotently provisions and returns a store's settings row. Lazily creates
 * the single row (defaults, store-name seeded) the first time it is read or
 * updated; `onConflictDoNothing` on the unique `store_id` makes concurrent
 * provisioning safe. Tenant-scoped: only the given store's row is touched.
 */
export async function ensureSettings(
  storeId: string,
): Promise<StoreSettingsRow> {
  const [existing] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.storeId, storeId))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [store] = await db
    .select({ name: stores.name })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  await db
    .insert(storeSettings)
    .values({ storeId, data: buildInitialData(store?.name ?? "") })
    .onConflictDoNothing({ target: storeSettings.storeId });

  const [row] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.storeId, storeId))
    .limit(1);

  if (!row) {
    // Should be unreachable: we just inserted (or a concurrent insert won).
    throw new Error("Failed to provision store settings");
  }
  return row;
}

/** Returns the store's settings (lazily provisioning on first read). */
export async function getStoreSettings(
  storeId: string,
): Promise<StoreSettingsRow> {
  return ensureSettings(storeId);
}

/**
 * Applies a partial settings update: merges the patch onto the current
 * (normalized) settings, validates the complete result, and persists it.
 * Tenant-scoped — only the caller's store row is updated.
 */
export async function updateStoreSettings(
  storeId: string,
  patch: UpdateSettingsInput,
): Promise<StoreSettingsRow> {
  const current = await ensureSettings(storeId);
  const merged = mergeSettings(normalizeSettings(current.data), patch);

  const result = settingsSchema.safeParse(merged);
  if (!result.success) {
    throw new ValidationError("Invalid settings", result.error.flatten());
  }

  const [updated] = await db
    .update(storeSettings)
    .set({ data: result.data, updatedAt: new Date() })
    .where(eq(storeSettings.storeId, storeId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update store settings");
  }
  return updated;
}
