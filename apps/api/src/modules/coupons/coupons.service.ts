import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import { coupons, type CouponRow } from "../../db/schema/coupons";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import type {
  CreateCouponInput,
  ListCouponsQuery,
  UpdateCouponInput,
} from "./coupons.schemas";

/**
 * Coupon management (Phase 28). Reads serve the mirror (refreshed by
 * sync/webhooks); create/update/delete go through the command outbox and then
 * refresh the mirror from the connector response.
 */

export interface ListCouponsResult {
  items: CouponRow[];
  total: number;
  page: number;
  limit: number;
}

export async function listCoupons(
  storeId: string,
  query: ListCouponsQuery,
): Promise<ListCouponsResult> {
  const conditions = [eq(coupons.storeId, storeId)];
  if (query.search) {
    conditions.push(ilike(coupons.code, `%${escapeLike(query.search)}%`));
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(coupons)
      .where(whereClause)
      .orderBy(desc(coupons.createdAt), desc(coupons.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(coupons).where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function getCouponById(
  storeId: string,
  id: string,
): Promise<CouponRow | null> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.storeId, storeId), eq(coupons.id, id)))
    .limit(1);
  return row ?? null;
}

/** Shapes a create/update body into the connector coupon payload. */
function toCouponPayload(
  input: CreateCouponInput | UpdateCouponInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) payload[key] = value;
  };
  const anyInput = input as Record<string, unknown>;
  assign("code", anyInput.code);
  assign("discountType", anyInput.discountType);
  assign(
    "amount",
    typeof anyInput.amount === "number"
      ? (anyInput.amount as number).toFixed(2)
      : undefined,
  );
  assign("description", anyInput.description);
  assign("freeShipping", anyInput.freeShipping);
  assign("usageLimit", anyInput.usageLimit);
  assign("usageLimitPerUser", anyInput.usageLimitPerUser);
  assign(
    "dateExpires",
    anyInput.dateExpires instanceof Date
      ? (anyInput.dateExpires as Date).toISOString().slice(0, 10)
      : anyInput.dateExpires === null
        ? null
        : undefined,
  );
  assign(
    "minimumAmount",
    typeof anyInput.minimumAmount === "number"
      ? (anyInput.minimumAmount as number).toFixed(2)
      : anyInput.minimumAmount,
  );
  assign(
    "maximumAmount",
    typeof anyInput.maximumAmount === "number"
      ? (anyInput.maximumAmount as number).toFixed(2)
      : anyInput.maximumAmount,
  );
  assign("individualUse", anyInput.individualUse);
  assign("excludeSaleItems", anyInput.excludeSaleItems);
  assign("productIds", anyInput.productIds);
  assign("excludedProductIds", anyInput.excludedProductIds);
  assign("productCategoryIds", anyInput.productCategoryIds);
  assign("excludedProductCategoryIds", anyInput.excludedProductCategoryIds);
  assign("emailRestrictions", anyInput.emailRestrictions);
  return payload;
}

/** Connector coupon response. */
interface CouponResult {
  wpCouponId: number;
  code: string;
  discountType: string;
  amount: string;
  description: string | null;
  freeShipping: boolean;
  usageCount: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  dateExpires: string | null;
  restrictions: Record<string, unknown> | null;
  dateModified: string | null;
}

function parseCouponResult(data: unknown): CouponResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const wpCouponId = Number(d.wpCouponId);
  if (!Number.isInteger(wpCouponId) || wpCouponId <= 0) return null;
  return {
    wpCouponId,
    code: typeof d.code === "string" ? d.code : "",
    discountType:
      typeof d.discountType === "string" ? d.discountType : "fixed_cart",
    amount: typeof d.amount === "string" ? d.amount : String(d.amount ?? "0"),
    description: typeof d.description === "string" ? d.description : null,
    freeShipping: d.freeShipping === true,
    usageCount: Number.isInteger(Number(d.usageCount))
      ? Number(d.usageCount)
      : 0,
    usageLimit: d.usageLimit == null ? null : Number(d.usageLimit),
    usageLimitPerUser:
      d.usageLimitPerUser == null ? null : Number(d.usageLimitPerUser),
    dateExpires: typeof d.dateExpires === "string" ? d.dateExpires : null,
    restrictions:
      d.restrictions && typeof d.restrictions === "object"
        ? (d.restrictions as Record<string, unknown>)
        : null,
    dateModified: typeof d.dateModified === "string" ? d.dateModified : null,
  };
}

/** Upserts the coupon mirror keyed by (store, wpCouponId). */
async function upsertMirror(
  storeId: string,
  result: CouponResult,
): Promise<CouponRow> {
  const now = new Date();
  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.storeId, storeId),
        eq(coupons.wpCouponId, result.wpCouponId),
      ),
    )
    .limit(1);

  const dateExpires = result.dateExpires
    ? new Date(result.dateExpires)
    : null;

  const fields = {
    code: result.code,
    discountType: result.discountType,
    amount: result.amount,
    description: result.description,
    freeShipping: result.freeShipping,
    usageCount: result.usageCount,
    usageLimit: result.usageLimit,
    usageLimitPerUser: result.usageLimitPerUser,
    dateExpires:
      dateExpires && !Number.isNaN(dateExpires.getTime()) ? dateExpires : null,
    restrictions: result.restrictions,
    wpVersion: result.dateModified,
    lastSyncedAt: now,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(coupons)
      .set(fields)
      .where(eq(coupons.id, existing.id))
      .returning();
    return updated!;
  }
  const [inserted] = await db
    .insert(coupons)
    .values({ storeId, wpCouponId: result.wpCouponId, ...fields })
    .returning();
  if (!inserted) {
    throw new Error("Failed to record coupon mirror row");
  }
  return inserted;
}

export async function createCoupon(
  storeId: string,
  input: CreateCouponInput,
  userId: string,
): Promise<CouponRow> {
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "coupon",
    action: "create",
    payload: toCouponPayload(input),
    createdBy: userId,
  });
  const result = parseCouponResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the coupon but returned an unexpected response.",
    );
  }
  return upsertMirror(storeId, result);
}

export async function updateCoupon(
  storeId: string,
  id: string,
  input: UpdateCouponInput,
  userId: string,
): Promise<CouponRow> {
  const coupon = await getCouponById(storeId, id);
  if (!coupon) {
    throw new NotFoundError("Coupon not found");
  }
  if (!coupon.wpCouponId) {
    throw new ServiceUnavailableError(
      "This coupon is not linked to WooCommerce yet. Re-sync and try again.",
    );
  }
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "coupon",
    action: "update",
    targetWpId: coupon.wpCouponId,
    payload: toCouponPayload(input),
    expectedVersion: coupon.wpVersion,
    createdBy: userId,
  });
  const result = parseCouponResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the update but returned an unexpected response.",
    );
  }
  return upsertMirror(storeId, result);
}

export async function deleteCoupon(
  storeId: string,
  id: string,
  userId: string,
): Promise<CouponRow> {
  const coupon = await getCouponById(storeId, id);
  if (!coupon) {
    throw new NotFoundError("Coupon not found");
  }
  if (coupon.wpCouponId) {
    await runWpCommandOrThrow({
      storeId,
      domain: "coupon",
      action: "delete",
      targetWpId: coupon.wpCouponId,
      payload: { force: true },
      createdBy: userId,
    });
  }
  await db.delete(coupons).where(eq(coupons.id, coupon.id));
  return coupon;
}

/**
 * Upserts coupons pulled from the connector during sync (Phase 28/31).
 * Keyed by (store, wpCouponId).
 */
export interface WooCoupon {
  wpCouponId: number;
  code: string;
  discountType: string;
  amount: string;
  description: string | null;
  freeShipping: boolean;
  usageCount: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  dateExpires: string | null;
  restrictions: Record<string, unknown> | null;
  dateModified: string | null;
}

export async function upsertCouponsFromWoo(
  storeId: string,
  incoming: WooCoupon[],
): Promise<{ total: number; created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of incoming) {
    const [before] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(
          eq(coupons.storeId, storeId),
          eq(coupons.wpCouponId, item.wpCouponId),
        ),
      )
      .limit(1);
    await upsertMirror(storeId, item);
    if (before) updated += 1;
    else created += 1;
  }
  return { total: incoming.length, created, updated };
}
