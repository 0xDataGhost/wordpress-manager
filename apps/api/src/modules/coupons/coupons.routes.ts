import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createCouponHandler,
  deleteCouponHandler,
  getCouponHandler,
  listCouponsHandler,
  updateCouponHandler,
} from "./coupons.controller";
import {
  couponParamsSchema,
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
} from "./coupons.schemas";

const router = Router();

router.get(
  "/",
  authenticate,
  requirePermission("coupons.view"),
  validate({ query: listCouponsQuerySchema }),
  asyncHandler(listCouponsHandler),
);

router.get(
  "/:id",
  authenticate,
  requirePermission("coupons.view"),
  validate({ params: couponParamsSchema }),
  asyncHandler(getCouponHandler),
);

router.post(
  "/",
  authenticate,
  requirePermission("coupons.manage"),
  validate({ body: createCouponSchema }),
  asyncHandler(createCouponHandler),
);

router.put(
  "/:id",
  authenticate,
  requirePermission("coupons.manage"),
  validate({ params: couponParamsSchema, body: updateCouponSchema }),
  asyncHandler(updateCouponHandler),
);

router.delete(
  "/:id",
  authenticate,
  requirePermission("coupons.manage"),
  validate({ params: couponParamsSchema }),
  asyncHandler(deleteCouponHandler),
);

export default router;
