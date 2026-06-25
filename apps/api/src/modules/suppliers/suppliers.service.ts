import { and, asc, count, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { codeBatches, type CodeBatchRow } from "../../db/schema/code-batches";
import { digitalCodes } from "../../db/schema/digital-codes";
import { products } from "../../db/schema/products";
import { suppliers, type SupplierRow } from "../../db/schema/suppliers";
import {
  supplierProducts,
  type SupplierProductRow,
} from "../../db/schema/supplier-products";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { createNotification } from "../notifications/notifications.service";
import type {
  CreateSupplierInput,
  CreateSupplierProductInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
  UpdateSupplierProductInput,
} from "./suppliers.schemas";
import type {
  SupplierListItemDto,
  SupplierMetricsDto,
} from "./suppliers.serializer";
import { toSupplierDto } from "./suppliers.serializer";

/** invalid / total, rounded to 4 dp; 0 when there are no codes. Pure + testable. */
export function computeInvalidRate(invalid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((invalid / total) * 10000) / 10000;
}

/** Fetches a store-owned supplier or throws 404. */
async function getOwnedSupplier(
  storeId: string,
  id: string,
): Promise<SupplierRow> {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.storeId, storeId), eq(suppliers.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Supplier not found");
  return row;
}

/** Throws ConflictError when another supplier in the store has the same name. */
async function assertUniqueName(
  storeId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const conditions = [
    eq(suppliers.storeId, storeId),
    sql`lower(${suppliers.name}) = lower(${name})`,
  ];
  if (excludeId) conditions.push(ne(suppliers.id, excludeId));
  const [existing] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw new ConflictError("A supplier with this name already exists.");
  }
}

/* ----------------------------------- List ---------------------------------- */

export interface ListSuppliersResult {
  items: SupplierListItemDto[];
  total: number;
  page: number;
  limit: number;
}

export async function listSuppliers(
  storeId: string,
  query: ListSuppliersQuery,
): Promise<ListSuppliersResult> {
  const conditions = [eq(suppliers.storeId, storeId)];
  if (query.status) conditions.push(eq(suppliers.status, query.status));
  if (query.search) {
    conditions.push(ilike(suppliers.name, `%${escapeLike(query.search)}%`));
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(whereClause)
      .orderBy(desc(suppliers.isPreferred), asc(suppliers.name), desc(suppliers.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(suppliers).where(whereClause),
  ]);

  const supplierIds = rows.map((r) => r.id);
  const productsCount = new Map<string, number>();
  const batchCount = new Map<string, number>();
  const lastBatchAt = new Map<string, Date>();

  if (supplierIds.length > 0) {
    const [productAgg, batchAgg] = await Promise.all([
      db
        .select({ supplierId: supplierProducts.supplierId, value: count() })
        .from(supplierProducts)
        .where(eq(supplierProducts.storeId, storeId))
        .groupBy(supplierProducts.supplierId),
      db
        .select({
          supplierId: codeBatches.supplierId,
          value: count(),
          last: sql<Date | null>`max(${codeBatches.createdAt})`,
        })
        .from(codeBatches)
        .where(eq(codeBatches.storeId, storeId))
        .groupBy(codeBatches.supplierId),
    ]);
    for (const r of productAgg) {
      if (r.supplierId) productsCount.set(r.supplierId, Number(r.value));
    }
    for (const r of batchAgg) {
      if (r.supplierId) {
        batchCount.set(r.supplierId, Number(r.value));
        if (r.last) lastBatchAt.set(r.supplierId, new Date(r.last));
      }
    }
  }

  return {
    items: rows.map((row) => ({
      ...toSupplierDto(row),
      productsCount: productsCount.get(row.id) ?? 0,
      batchesCount: batchCount.get(row.id) ?? 0,
      lastBatchAt: lastBatchAt.get(row.id) ?? null,
    })),
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/* --------------------------------- Details --------------------------------- */

export interface SupplierDetails {
  supplier: SupplierRow;
  metrics: SupplierMetricsDto;
}

export async function getSupplierDetails(
  storeId: string,
  id: string,
): Promise<SupplierDetails> {
  const supplier = await getOwnedSupplier(storeId, id);
  const metrics = await getSupplierMetrics(storeId, id, supplier.currency);
  return { supplier, metrics };
}

export async function getSupplierMetrics(
  storeId: string,
  supplierId: string,
  currency: string | null,
): Promise<SupplierMetricsDto> {
  const [statusCounts, costAgg, batchAgg, productAgg] = await Promise.all([
    db
      .select({ status: digitalCodes.status, value: count() })
      .from(digitalCodes)
      .where(
        and(
          eq(digitalCodes.storeId, storeId),
          eq(digitalCodes.supplierId, supplierId),
        ),
      )
      .groupBy(digitalCodes.status),
    db
      .select({ value: sql<string | null>`sum(${digitalCodes.costPrice})` })
      .from(digitalCodes)
      .where(
        and(
          eq(digitalCodes.storeId, storeId),
          eq(digitalCodes.supplierId, supplierId),
        ),
      ),
    db
      .select({ value: count() })
      .from(codeBatches)
      .where(
        and(
          eq(codeBatches.storeId, storeId),
          eq(codeBatches.supplierId, supplierId),
        ),
      ),
    db
      .select({ value: count() })
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.storeId, storeId),
          eq(supplierProducts.supplierId, supplierId),
        ),
      ),
  ]);

  const byStatus = new Map<string, number>();
  for (const r of statusCounts) byStatus.set(r.status, Number(r.value));
  const get = (s: string) => byStatus.get(s) ?? 0;
  const totalCodes = [...byStatus.values()].reduce((a, b) => a + b, 0);
  const invalid = get("invalid");
  const costSum = costAgg[0]?.value;

  return {
    totalCodes,
    available: get("available"),
    sold: get("sold"),
    delivered: get("delivered"),
    invalid,
    voided: get("voided"),
    refunded: get("refunded"),
    batchesCount: Number(batchAgg[0]?.value ?? 0),
    productsCount: Number(productAgg[0]?.value ?? 0),
    estimatedCost: costSum != null ? Number(costSum).toFixed(4) : null,
    currency,
    invalidRate: computeInvalidRate(invalid, totalCodes),
  };
}

/* ---------------------------------- Create --------------------------------- */

export async function createSupplier(
  storeId: string,
  input: CreateSupplierInput,
): Promise<SupplierRow> {
  await assertUniqueName(storeId, input.name);

  return db.transaction(async (tx) => {
    if (input.isPreferred) {
      await tx
        .update(suppliers)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(
          and(eq(suppliers.storeId, storeId), eq(suppliers.isPreferred, true)),
        );
    }
    const [row] = await tx
      .insert(suppliers)
      .values({
        storeId,
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        country: input.country ?? null,
        currency: input.currency ?? null,
        notes: input.notes ?? null,
        status: input.status,
        isPreferred: input.isPreferred,
      })
      .returning();
    if (!row) throw new Error("Failed to create supplier");
    return row;
  });
}

/* ---------------------------------- Update --------------------------------- */

export interface UpdateSupplierResult {
  supplier: SupplierRow;
  /** True when this update left a PREFERRED supplier in a non-active state. */
  preferredWentInactive: boolean;
}

export async function updateSupplier(
  storeId: string,
  id: string,
  input: UpdateSupplierInput,
): Promise<UpdateSupplierResult> {
  const current = await getOwnedSupplier(storeId, id);
  if (input.name !== undefined && input.name !== current.name) {
    await assertUniqueName(storeId, input.name, id);
  }

  const values: Partial<typeof suppliers.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.contactName !== undefined) values.contactName = input.contactName;
  if (input.email !== undefined) values.email = input.email;
  if (input.phone !== undefined) values.phone = input.phone;
  if (input.website !== undefined) values.website = input.website;
  if (input.country !== undefined) values.country = input.country;
  if (input.currency !== undefined) values.currency = input.currency;
  if (input.notes !== undefined) values.notes = input.notes;
  if (input.status !== undefined) values.status = input.status;
  if (input.isPreferred !== undefined) values.isPreferred = input.isPreferred;

  const supplier = await db.transaction(async (tx) => {
    if (input.isPreferred === true) {
      await tx
        .update(suppliers)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(
          and(
            eq(suppliers.storeId, storeId),
            eq(suppliers.isPreferred, true),
            ne(suppliers.id, id),
          ),
        );
    }
    const [row] = await tx
      .update(suppliers)
      .set(values)
      .where(and(eq(suppliers.storeId, storeId), eq(suppliers.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Supplier not found");
    return row;
  });

  const preferredWentInactive =
    supplier.isPreferred && supplier.status !== "active";
  if (preferredWentInactive) {
    await notifyPreferredInactive(storeId, supplier.id, supplier.name);
  }

  return { supplier, preferredWentInactive };
}

/* ---------------------------------- Archive -------------------------------- */

/** Soft-deletes (archives) a supplier. Blocked while it has ACTIVE batches. */
export async function archiveSupplier(
  storeId: string,
  id: string,
): Promise<SupplierRow> {
  await getOwnedSupplier(storeId, id);

  const [activeBatches] = await db
    .select({ value: count() })
    .from(codeBatches)
    .where(
      and(
        eq(codeBatches.storeId, storeId),
        eq(codeBatches.supplierId, id),
        eq(codeBatches.status, "active"),
      ),
    );
  if (Number(activeBatches?.value ?? 0) > 0) {
    throw new ConflictError(
      "Cannot archive a supplier that still has active batches.",
    );
  }

  const [row] = await db
    .update(suppliers)
    .set({ status: "archived", isPreferred: false, updatedAt: new Date() })
    .where(and(eq(suppliers.storeId, storeId), eq(suppliers.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Supplier not found");
  return row;
}

/* ------------------------------ Supplier products -------------------------- */

export async function listSupplierProducts(
  storeId: string,
  supplierId: string,
): Promise<SupplierProductRow[]> {
  await getOwnedSupplier(storeId, supplierId);
  return db
    .select()
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.storeId, storeId),
        eq(supplierProducts.supplierId, supplierId),
      ),
    )
    .orderBy(desc(supplierProducts.createdAt), desc(supplierProducts.id));
}

export async function linkSupplierProduct(
  storeId: string,
  supplierId: string,
  input: CreateSupplierProductInput,
): Promise<SupplierProductRow> {
  await getOwnedSupplier(storeId, supplierId);

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.id, input.productId)))
    .limit(1);
  if (!product) throw new NotFoundError("Product not found");

  const [dup] = await db
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.storeId, storeId),
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.productId, input.productId),
      ),
    )
    .limit(1);
  if (dup) {
    throw new ConflictError("This product is already linked to the supplier.");
  }

  const [row] = await db
    .insert(supplierProducts)
    .values({
      storeId,
      supplierId,
      productId: input.productId,
      supplierSku: input.supplierSku ?? null,
      costPrice: input.costPrice !== undefined ? input.costPrice.toFixed(2) : null,
      currency: input.currency ?? null,
      minOrderQuantity: input.minOrderQuantity ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to link supplier product");
  return row;
}

export async function updateSupplierProduct(
  storeId: string,
  supplierId: string,
  mappingId: string,
  input: UpdateSupplierProductInput,
): Promise<SupplierProductRow> {
  await getOwnedSupplier(storeId, supplierId);

  const values: Partial<typeof supplierProducts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.supplierSku !== undefined) values.supplierSku = input.supplierSku;
  if (input.costPrice !== undefined) values.costPrice = input.costPrice.toFixed(2);
  if (input.currency !== undefined) values.currency = input.currency;
  if (input.minOrderQuantity !== undefined) {
    values.minOrderQuantity = input.minOrderQuantity;
  }
  if (input.leadTimeDays !== undefined) values.leadTimeDays = input.leadTimeDays;
  if (input.notes !== undefined) values.notes = input.notes;

  const [row] = await db
    .update(supplierProducts)
    .set(values)
    .where(
      and(
        eq(supplierProducts.storeId, storeId),
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.id, mappingId),
      ),
    )
    .returning();
  if (!row) throw new NotFoundError("Supplier product mapping not found");
  return row;
}

export async function unlinkSupplierProduct(
  storeId: string,
  supplierId: string,
  mappingId: string,
): Promise<void> {
  await getOwnedSupplier(storeId, supplierId);
  const deleted = await db
    .delete(supplierProducts)
    .where(
      and(
        eq(supplierProducts.storeId, storeId),
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.id, mappingId),
      ),
    )
    .returning({ id: supplierProducts.id });
  if (deleted.length === 0) {
    throw new NotFoundError("Supplier product mapping not found");
  }
}

/* -------------------------------- Batches ---------------------------------- */

export async function listSupplierBatches(
  storeId: string,
  supplierId: string,
): Promise<CodeBatchRow[]> {
  await getOwnedSupplier(storeId, supplierId);
  return db
    .select()
    .from(codeBatches)
    .where(
      and(
        eq(codeBatches.storeId, storeId),
        eq(codeBatches.supplierId, supplierId),
      ),
    )
    .orderBy(desc(codeBatches.createdAt), desc(codeBatches.id))
    .limit(200);
}

/* ------------------------------ Import guard ------------------------------- */

/**
 * Validates a supplier can receive a new import: it must belong to the store and
 * be `active`. Raises an "import blocked" notification + 400 otherwise. Returns
 * the supplier's default currency so the import can fall back to it.
 */
export async function assertSupplierImportable(
  storeId: string,
  supplierId: string,
): Promise<{ currency: string | null }> {
  const supplier = await getOwnedSupplier(storeId, supplierId);
  if (supplier.status !== "active") {
    await notifyImportBlocked(storeId, supplier.id, supplier.name);
    throw new ValidationError(
      "Supplier is not active and cannot receive new imports.",
    );
  }
  return { currency: supplier.currency };
}

/* ------------------------------ Notifications ------------------------------ */

async function notifyImportBlocked(
  storeId: string,
  supplierId: string,
  name: string,
): Promise<void> {
  try {
    await createNotification({
      storeId,
      type: "digital_inventory",
      title: "تم حظر الاستيراد من المورد",
      message: `المورد «${name}» غير نشط ولا يمكن الاستيراد منه.`,
      severity: "warning",
      metadata: { supplierId },
    });
  } catch {
    /* best-effort */
  }
}

async function notifyPreferredInactive(
  storeId: string,
  supplierId: string,
  name: string,
): Promise<void> {
  try {
    await createNotification({
      storeId,
      type: "digital_inventory",
      title: "المورد المفضّل غير نشط",
      message: `المورد المفضّل «${name}» أصبح غير نشط.`,
      severity: "warning",
      metadata: { supplierId },
    });
  } catch {
    /* best-effort */
  }
}
