import { and, eq } from "drizzle-orm";
import type { DbTransaction } from "../../db";
import {
  externalMappings,
  type MappingEntityType,
  type MappingSource,
} from "../../db/schema/external-mappings";

/**
 * Read/write helpers for the generic external_mappings table — the backbone of
 * idempotent sync. Every helper runs inside a caller-provided transaction so a
 * sync batch and its mappings commit atomically.
 *
 * The (store_id, entity_type, source, external_id) unique index guarantees a
 * given external record maps to exactly one local row; upserting the mapping is
 * what makes repeated syncs update-in-place instead of duplicating.
 */

export interface MappingKey {
  storeId: string;
  entityType: MappingEntityType;
  source: MappingSource;
  externalId: string;
}

/** Resolves the local row id for an external record, or null when unmapped. */
export async function findLocalId(
  tx: DbTransaction,
  key: MappingKey,
): Promise<string | null> {
  const [row] = await tx
    .select({ localId: externalMappings.localId })
    .from(externalMappings)
    .where(
      and(
        eq(externalMappings.storeId, key.storeId),
        eq(externalMappings.entityType, key.entityType),
        eq(externalMappings.source, key.source),
        eq(externalMappings.externalId, key.externalId),
      ),
    )
    .limit(1);
  return row?.localId ?? null;
}

/**
 * Inserts or refreshes the mapping from an external record to a local row. On
 * conflict (same store/entity/source/external_id) it points the mapping at the
 * given localId and bumps updatedAt.
 */
export async function upsertMapping(
  tx: DbTransaction,
  key: MappingKey,
  localId: string,
): Promise<void> {
  const now = new Date();
  await tx
    .insert(externalMappings)
    .values({
      storeId: key.storeId,
      entityType: key.entityType,
      source: key.source,
      externalId: key.externalId,
      localId,
    })
    .onConflictDoUpdate({
      target: [
        externalMappings.storeId,
        externalMappings.entityType,
        externalMappings.source,
        externalMappings.externalId,
      ],
      set: { localId, updatedAt: now },
    });
}
