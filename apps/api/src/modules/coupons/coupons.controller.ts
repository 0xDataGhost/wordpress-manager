import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toCouponDto } from "./coupons.serializer";
import {
  createCoupon,
  deleteCoupon,
  getCouponById,
  listCoupons,
  updateCoupon,
} from "./coupons.service";
import type {
  CouponParams,
  CreateCouponInput,
  ListCouponsQuery,
  UpdateCouponInput,
} from "./coupons.schemas";

export async function listCouponsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListCouponsQuery;
  const result = await listCoupons(storeId, query);
  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toCouponDto),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      },
      "",
    ),
  );
}

export async function getCouponHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CouponParams;
  const coupon = await getCouponById(storeId, id);
  if (!coupon) {
    throw new NotFoundError("Coupon not found");
  }
  res.status(200).json(successResponse(toCouponDto(coupon), ""));
}

export async function createCouponHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as CreateCouponInput;
  const coupon = await createCoupon(storeId, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.COUPON_CREATED,
    entityType: AUDIT_ENTITY_TYPES.COUPON,
    entityId: coupon.id,
    message: `أنشأ كوبوناً: ${coupon.code}`,
    metadata: {
      code: coupon.code,
      discountType: coupon.discountType,
      wpCouponId: coupon.wpCouponId,
    },
  });
  res.status(201).json(successResponse(toCouponDto(coupon), "Coupon created"));
}

export async function updateCouponHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as CouponParams;
  const input = req.body as UpdateCouponInput;
  const coupon = await updateCoupon(storeId, id, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.COUPON_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.COUPON,
    entityId: coupon.id,
    message: `حدّث كوبوناً: ${coupon.code}`,
    metadata: { code: coupon.code, changed: Object.keys(input) },
  });
  res.status(200).json(successResponse(toCouponDto(coupon), "Coupon updated"));
}

export async function deleteCouponHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as CouponParams;
  const coupon = await deleteCoupon(storeId, id, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.COUPON_DELETED,
    entityType: AUDIT_ENTITY_TYPES.COUPON,
    entityId: coupon.id,
    message: `حذف كوبوناً: ${coupon.code}`,
    metadata: { code: coupon.code, wpCouponId: coupon.wpCouponId },
  });
  res.status(204).send();
}
