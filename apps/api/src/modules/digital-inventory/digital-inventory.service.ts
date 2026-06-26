import { and, count, desc, eq, ilike, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  codeBatches,
  type CodeBatchRow,
} from "../../db/schema/code-batches";
import {
  digitalCodes,
  type DigitalCodeRow,
} from "../../db/schema/digital-codes";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { products } from "../../db/schema/products";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { decryptDigitalCode } from "../../lib/digital-code-crypto";
import { escapeLike } from "../../lib/sql";
import {
  getAllowedTransitions,
  isTransitionAllowed,
  type ListBatchesQuery,
  type ListCodesQuery,
  type SummaryQuery,
  type UpdateCodeStatusInput,
} from "./digital-inventory.schemas";
import type { CodeRowWithNames } from "./digital-inventory.serializer";

/* --------------------------------- Summary ------------------------------- */

export interface LowStockProduct {
  productId: string;
  productName: string | null;
  available: number;
  threshold: number;
}

export interface InventorySummary {
  totalCodes: number;
  available: number;
  reserved: number;
  sold: number;
  delivered: number;
  invalid: number;
  voided: number;
  lowStockProducts: LowStockProduct[];
}

/**
 * Status counts (optionally for one product) + the digital-enabled products that
 * are at/under their low-stock threshold. Tenant-scoped; counts the rows, never
 * decrypts anything.
 */
export async function getInventorySummary(
  storeId: string,
  query: SummaryQuery,
): Promise<InventorySummary> {
  const conditions = [eq(digitalCodes.storeId, storeId)];
  if (query.productId) {
    conditions.push(eq(digitalCodes.productId, query.productId));
  }

  const grouped = await db
    .select({ status: digitalCodes.status, value: count() })
    .from(digitalCodes)
    .where(and(...conditions))
    .groupBy(digitalCodes.status);

  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = Number(row.value);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // Low-stock: enabled digital products whose available count <= threshold.
  const availableCount = sql<number>`count(${digitalCodes.id}) filter (where ${digitalCodes.status} = 'available')`;
  const lowStockConditions = [
    eq(digitalProductSettings.storeId, storeId),
    eq(digitalProductSettings.isEnabled, true),
  ];
  if (query.productId) {
    lowStockConditions.push(
      eq(digitalProductSettings.productId, query.productId),
    );
  }

  const lowStockRows = await db
    .select({
      productId: digitalProductSettings.productId,
      productName: products.name,
      threshold: digitalProductSettings.lowStockThreshold,
      available: availableCount,
    })
    .from(digitalProductSettings)
    .innerJoin(products, eq(products.id, digitalProductSettings.productId))
    .leftJoin(
      digitalCodes,
      and(
        eq(digitalCodes.productId, digitalProductSettings.productId),
        eq(digitalCodes.storeId, digitalProductSettings.storeId),
      ),
    )
    .where(and(...lowStockConditions))
    .groupBy(
      digitalProductSettings.productId,
      products.name,
      digitalProductSettings.lowStockThreshold,
    )
    .having(sql`${availableCount} <= ${digitalProductSettings.lowStockThreshold}`);

  return {
    totalCodes: total,
    available: counts.available ?? 0,
    reserved: counts.reserved ?? 0,
    sold: counts.sold ?? 0,
    delivered: counts.delivered ?? 0,
    invalid: counts.invalid ?? 0,
    voided: counts.voided ?? 0,
    lowStockProducts: lowStockRows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      available: Number(row.available),
      threshold: row.threshold,
    })),
  };
}

/* ------------------------------- List codes ------------------------------ */

export interface ListCodesResult {
  items: CodeRowWithNames[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lists masked codes for the store with optional filters + search. Search matches
 * the masked preview, product name, or batch name only — it NEVER decrypts.
 * Tenant-scoped; the row's encrypted material is mapped away by the serializer.
 */
export async function listCodes(
  storeId: string,
  query: ListCodesQuery,
): Promise<ListCodesResult> {
  const conditions = [eq(digitalCodes.storeId, storeId)];
  if (query.productId) conditions.push(eq(digitalCodes.productId, query.productId));
  if (query.batchId) conditions.push(eq(digitalCodes.batchId, query.batchId));
  if (query.supplierId) {
    conditions.push(eq(digitalCodes.supplierId, query.supplierId));
  }
  if (query.status) conditions.push(eq(digitalCodes.status, query.status));
  if (query.expiresBefore) {
    // Only codes that actually have an expiry on/before the bound.
    conditions.push(isNotNull(digitalCodes.expiresAt));
    conditions.push(lte(digitalCodes.expiresAt, query.expiresBefore));
  }
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    const match = or(
      ilike(digitalCodes.codePreview, term),
      ilike(products.name, term),
      ilike(codeBatches.batchName, term),
    );
    if (match) conditions.push(match);
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [rows, totals] = await Promise.all([
    db
      .select({
        code: digitalCodes,
        productName: products.name,
        batchName: codeBatches.batchName,
      })
      .from(digitalCodes)
      .leftJoin(products, eq(products.id, digitalCodes.productId))
      .leftJoin(codeBatches, eq(codeBatches.id, digitalCodes.batchId))
      .where(whereClause)
      .orderBy(desc(digitalCodes.createdAt), desc(digitalCodes.id))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(digitalCodes)
      .leftJoin(products, eq(products.id, digitalCodes.productId))
      .leftJoin(codeBatches, eq(codeBatches.id, digitalCodes.batchId))
      .where(whereClause),
  ]);

  return {
    items: rows,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/** Fetches one masked code (scoped to the store), or null when not found. */
export async function getCode(
  storeId: string,
  id: string,
): Promise<CodeRowWithNames | null> {
  const [row] = await db
    .select({
      code: digitalCodes,
      productName: products.name,
      batchName: codeBatches.batchName,
    })
    .from(digitalCodes)
    .leftJoin(products, eq(products.id, digitalCodes.productId))
    .leftJoin(codeBatches, eq(codeBatches.id, digitalCodes.batchId))
    .where(and(eq(digitalCodes.storeId, storeId), eq(digitalCodes.id, id)))
    .limit(1);
  return row ?? null;
}

/* --------------------------------- Batches ------------------------------- */

export interface ListBatchesResult {
  items: { batch: CodeBatchRow; productName: string | null }[];
  total: number;
  page: number;
  limit: number;
}

export async function listBatches(
  storeId: string,
  query: ListBatchesQuery,
): Promise<ListBatchesResult> {
  const conditions = [eq(codeBatches.storeId, storeId)];
  if (query.productId) conditions.push(eq(codeBatches.productId, query.productId));
  if (query.status) conditions.push(eq(codeBatches.status, query.status));
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [rows, totals] = await Promise.all([
    db
      .select({ batch: codeBatches, productName: products.name })
      .from(codeBatches)
      .leftJoin(products, eq(products.id, codeBatches.productId))
      .where(whereClause)
      .orderBy(desc(codeBatches.createdAt), desc(codeBatches.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(codeBatches).where(whereClause),
  ]);

  return {
    items: rows,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export interface BatchDetails {
  batch: CodeBatchRow;
  productName: string | null;
  /** Live status breakdown computed from the batch's codes (authoritative). */
  statusBreakdown: Record<string, number>;
}

export async function getBatch(
  storeId: string,
  id: string,
): Promise<BatchDetails | null> {
  const [row] = await db
    .select({ batch: codeBatches, productName: products.name })
    .from(codeBatches)
    .leftJoin(products, eq(products.id, codeBatches.productId))
    .where(and(eq(codeBatches.storeId, storeId), eq(codeBatches.id, id)))
    .limit(1);
  if (!row) return null;

  const grouped = await db
    .select({ status: digitalCodes.status, value: count() })
    .from(digitalCodes)
    .where(and(eq(digitalCodes.storeId, storeId), eq(digitalCodes.batchId, id)))
    .groupBy(digitalCodes.status);

  const statusBreakdown: Record<string, number> = {};
  for (const g of grouped) statusBreakdown[g.status] = Number(g.value);

  return { batch: row.batch, productName: row.productName, statusBreakdown };
}

/* --------------------------------- Reveal -------------------------------- */

export interface RevealedCode {
  id: string;
  code: string;
  revealedAt: Date;
  productId: string;
  batchId: string | null;
  codePreview: string | null;
  status: string;
}

/**
 * Decrypts and returns the full plaintext of one code (scoped to the store).
 * Caller MUST gate this behind `digital_inventory.reveal` + rate limiting and
 * audit-log the reveal. The raw code is returned ONLY here and never logged.
 */
export async function revealCode(
  storeId: string,
  id: string,
): Promise<RevealedCode> {
  const [row] = await db
    .select()
    .from(digitalCodes)
    .where(and(eq(digitalCodes.storeId, storeId), eq(digitalCodes.id, id)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Code not found");
  }

  const code = decryptDigitalCode({
    cipher: row.codeCipher,
    iv: row.codeIv,
    tag: row.codeTag,
  });

  return {
    id: row.id,
    code,
    revealedAt: new Date(),
    productId: row.productId,
    batchId: row.batchId,
    codePreview: row.codePreview,
    status: row.status,
  };
}

/* ----------------------------- Status update ----------------------------- */

export interface StatusUpdateResult {
  code: DigitalCodeRow;
  fromStatus: string;
  toStatus: string;
}

/**
 * Applies a validated manual status change (e.g. void/invalidate/expire). The
 * transition must be allowed for the current status; the reason is persisted on
 * the code's metadata (a light trail) but never returned/logged as code material.
 * No order assignment or refund workflow here. Tenant-scoped.
 */
export async function updateCodeStatus(
  storeId: string,
  id: string,
  input: UpdateCodeStatusInput,
): Promise<StatusUpdateResult> {
  const [row] = await db
    .select()
    .from(digitalCodes)
    .where(and(eq(digitalCodes.storeId, storeId), eq(digitalCodes.id, id)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Code not found");
  }

  const fromStatus = row.status;
  const toStatus = input.status;
  if (!isTransitionAllowed(fromStatus, toStatus)) {
    throw new ValidationError(
      `Cannot change status from "${fromStatus}" to "${toStatus}".`,
      { allowed: getAllowedTransitions(fromStatus) },
    );
  }

  const metadata = {
    ...(row.metadata ?? {}),
    lastStatusChange: {
      from: fromStatus,
      to: toStatus,
      reason: input.reason,
      at: new Date().toISOString(),
    },
  };

  const [updated] = await db
    .update(digitalCodes)
    .set({ status: toStatus, metadata, updatedAt: new Date() })
    .where(and(eq(digitalCodes.storeId, storeId), eq(digitalCodes.id, id)))
    .returning();
  if (!updated) {
    throw new NotFoundError("Code not found");
  }

  return { code: updated, fromStatus, toStatus };
}
