import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { codeBatches } from "../../db/schema/code-batches";
import { digitalCodes } from "../../db/schema/digital-codes";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { products } from "../../db/schema/products";
import { env } from "../../config/env";
import {
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../../lib/errors";
import { isDigitalCodeCryptoConfigured } from "../../lib/digital-code-crypto";
import { createNotification } from "../notifications/notifications.service";
import { assertSupplierImportable } from "../suppliers/suppliers.service";
import { buildImportCandidates } from "./digital-inventory.parse";
import type { ImportCodesInput } from "./digital-inventory.schemas";

export interface ImportResult {
  batchId: string | null;
  received: number;
  inserted: number;
  duplicatesInFile: number;
  duplicatesExisting: number;
  invalid: number;
  productId: string;
}

/**
 * Imports raw codes into a store-owned, digital-enabled product. Tenant-scoped
 * throughout. Encrypts every code at rest, dedupes within the file and against
 * existing rows (by HMAC fingerprint), inserts only unique codes inside a
 * transaction, and creates a batch when at least one code lands. Raises a
 * notification when nothing was inserted or the product stays below its low-stock
 * threshold. Returns counts only — never any raw or encrypted code material.
 */
export async function importCodes(
  storeId: string,
  userId: string,
  input: ImportCodesInput,
): Promise<ImportResult> {
  if (!isDigitalCodeCryptoConfigured()) {
    throw new ServiceUnavailableError(
      "Digital code encryption is not configured on the server.",
    );
  }

  // Product must belong to the store.
  const [product] = await db
    .select({ id: products.id, name: products.name, status: products.status })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.id, input.productId)))
    .limit(1);
  if (!product) {
    throw new NotFoundError("Product not found");
  }

  // Product must have digital fulfillment enabled.
  const [settings] = await db
    .select({ isEnabled: digitalProductSettings.isEnabled })
    .from(digitalProductSettings)
    .where(
      and(
        eq(digitalProductSettings.storeId, storeId),
        eq(digitalProductSettings.productId, input.productId),
      ),
    )
    .limit(1);
  if (!settings?.isEnabled) {
    throw new ValidationError(
      "Digital fulfillment is not enabled for this product.",
    );
  }

  // Optional supplier: must belong to the store and be active (Phase 20). Falls
  // back to the supplier's default currency when the import omits one.
  const supplierId = input.supplierId ?? null;
  let currency = input.currency ?? null;
  if (supplierId) {
    const supplier = await assertSupplierImportable(storeId, supplierId);
    if (!currency) currency = supplier.currency;
  }

  const prepared = buildImportCandidates(input.codesText);

  if (prepared.received === 0) {
    throw new ValidationError("No valid codes found in the import.");
  }
  if (prepared.received > env.DIGITAL_CODE_IMPORT_MAX_CODES) {
    throw new ValidationError(
      `Too many codes in one import (max ${env.DIGITAL_CODE_IMPORT_MAX_CODES}).`,
    );
  }

  // Dedupe against existing rows by fingerprint (never decrypts anything).
  let duplicatesExisting = 0;
  let toInsert = prepared.candidates;
  if (toInsert.length > 0) {
    const existing = await db
      .select({ codeHash: digitalCodes.codeHash })
      .from(digitalCodes)
      .where(
        and(
          eq(digitalCodes.storeId, storeId),
          eq(digitalCodes.productId, input.productId),
          inArray(
            digitalCodes.codeHash,
            toInsert.map((c) => c.hash),
          ),
        ),
      );
    const existingHashes = new Set(existing.map((row) => row.codeHash));
    if (existingHashes.size > 0) {
      const fresh = toInsert.filter((c) => !existingHashes.has(c.hash));
      duplicatesExisting = toInsert.length - fresh.length;
      toInsert = fresh;
    }
  }

  const costPerCode =
    input.costPerCode !== undefined ? input.costPerCode.toFixed(4) : null;

  let batchId: string | null = null;
  let inserted = 0;

  if (toInsert.length > 0) {
    const result = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(codeBatches)
        .values({
          storeId,
          productId: input.productId,
          supplierId,
          batchName: input.batchName ?? null,
          source: input.source,
          currency,
          costPerCode,
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          status: "active",
          createdBy: userId,
        })
        .returning({ id: codeBatches.id });
      if (!batch) {
        throw new Error("Failed to create code batch");
      }

      const insertedRows = await tx
        .insert(digitalCodes)
        .values(
          toInsert.map((c) => ({
            storeId,
            productId: input.productId,
            batchId: batch.id,
            supplierId,
            codeCipher: c.cipher,
            codeIv: c.iv,
            codeTag: c.tag,
            codeHash: c.hash,
            codePreview: c.preview,
            status: "available",
            costPrice: costPerCode,
            currency,
            createdBy: userId,
          })),
        )
        // Concurrency guard: the unique (store_id, product_id, code_hash) index
        // means a racing import can never create a duplicate; such rows are
        // simply skipped and counted as existing duplicates below.
        .onConflictDoNothing({
          target: [
            digitalCodes.storeId,
            digitalCodes.productId,
            digitalCodes.codeHash,
          ],
        })
        .returning({ id: digitalCodes.id });

      const insertedCount = insertedRows.length;

      // Extreme race: every candidate was inserted concurrently between our
      // dedupe SELECT and this INSERT — drop the now-empty batch.
      if (insertedCount === 0) {
        await tx.delete(codeBatches).where(eq(codeBatches.id, batch.id));
        return { batchId: null as string | null, insertedCount: 0 };
      }

      const costTotal =
        input.costPerCode !== undefined
          ? (input.costPerCode * insertedCount).toFixed(2)
          : null;
      await tx
        .update(codeBatches)
        .set({
          quantityTotal: insertedCount,
          quantityAvailable: insertedCount,
          costTotal,
          updatedAt: new Date(),
        })
        .where(eq(codeBatches.id, batch.id));

      return { batchId: batch.id, insertedCount };
    });

    batchId = result.batchId;
    inserted = result.insertedCount;
    // Codes that lost the insert race count as already-existing duplicates.
    duplicatesExisting += toInsert.length - inserted;
  }

  await maybeNotify({
    storeId,
    productId: input.productId,
    productName: product.name,
    inserted,
  });

  return {
    batchId,
    received: prepared.received,
    inserted,
    duplicatesInFile: prepared.duplicatesInFile,
    duplicatesExisting,
    invalid: prepared.invalid,
    productId: input.productId,
  };
}

/**
 * Best-effort notifications after an import: when nothing was inserted, and when
 * the product remains at/under its low-stock threshold. Never throws — a
 * notification failure must not break the import.
 */
async function maybeNotify(args: {
  storeId: string;
  productId: string;
  productName: string;
  inserted: number;
}): Promise<void> {
  try {
    if (args.inserted === 0) {
      await createNotification({
        storeId: args.storeId,
        type: "digital_inventory",
        title: "لم تتم إضافة أكواد جديدة",
        message: `لم تتم إضافة أي كود للمنتج «${args.productName}» (مكرر أو غير صالح).`,
        severity: "warning",
        metadata: { productId: args.productId, inserted: 0 },
      });
      return;
    }

    const [settings] = await db
      .select({ threshold: digitalProductSettings.lowStockThreshold })
      .from(digitalProductSettings)
      .where(
        and(
          eq(digitalProductSettings.storeId, args.storeId),
          eq(digitalProductSettings.productId, args.productId),
        ),
      )
      .limit(1);
    if (!settings) return;

    const [availableAgg] = await db
      .select({ value: count() })
      .from(digitalCodes)
      .where(
        and(
          eq(digitalCodes.storeId, args.storeId),
          eq(digitalCodes.productId, args.productId),
          eq(digitalCodes.status, "available"),
        ),
      );
    const available = Number(availableAgg?.value ?? 0);

    if (available <= settings.threshold) {
      await createNotification({
        storeId: args.storeId,
        type: "digital_inventory",
        title: "مخزون أكواد منخفض",
        message: `المنتج «${args.productName}» ما زال عند أو تحت حد التنبيه (${available} كود متاح).`,
        severity: "warning",
        metadata: {
          productId: args.productId,
          available,
          threshold: settings.threshold,
        },
      });
    }
  } catch {
    // Best-effort only — never break the import on a notification failure.
  }
}
