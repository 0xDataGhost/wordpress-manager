import { z } from "zod";
import { COUPON_DISCOUNT_TYPES } from "../../db/schema/coupons";

export const listCouponsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const couponParamsSchema = z.object({
  id: z.string().uuid(),
});

const codeField = z.string().trim().min(1).max(100);
const amountField = z.number().nonnegative().max(99_999_999.99);
const idListField = z.array(z.number().int().positive()).max(500);
const emailListField = z
  .array(z.string().trim().email().max(320))
  .max(200);

/** The full WooCommerce coupon model the dashboard can express. */
const couponBodyShape = {
  code: codeField,
  discountType: z.enum(COUPON_DISCOUNT_TYPES).default("fixed_cart"),
  amount: amountField.default(0),
  description: z.string().trim().max(2000).optional(),
  freeShipping: z.boolean().default(false),
  usageLimit: z.number().int().positive().max(1_000_000).nullish(),
  usageLimitPerUser: z.number().int().positive().max(1_000_000).nullish(),
  // YYYY-MM-DD expiry (inclusive) or null to clear.
  dateExpires: z.coerce.date().nullish(),
  minimumAmount: amountField.nullish(),
  maximumAmount: amountField.nullish(),
  individualUse: z.boolean().default(false),
  excludeSaleItems: z.boolean().default(false),
  productIds: idListField.optional(),
  excludedProductIds: idListField.optional(),
  productCategoryIds: idListField.optional(),
  excludedProductCategoryIds: idListField.optional(),
  emailRestrictions: emailListField.optional(),
};

export const createCouponSchema = z.object(couponBodyShape);

export const updateCouponSchema = z
  .object({
    code: codeField.optional(),
    discountType: z.enum(COUPON_DISCOUNT_TYPES).optional(),
    amount: amountField.optional(),
    description: z.string().trim().max(2000).nullish(),
    freeShipping: z.boolean().optional(),
    usageLimit: z.number().int().positive().max(1_000_000).nullish(),
    usageLimitPerUser: z.number().int().positive().max(1_000_000).nullish(),
    dateExpires: z.coerce.date().nullish(),
    minimumAmount: amountField.nullish(),
    maximumAmount: amountField.nullish(),
    individualUse: z.boolean().optional(),
    excludeSaleItems: z.boolean().optional(),
    productIds: idListField.optional(),
    excludedProductIds: idListField.optional(),
    productCategoryIds: idListField.optional(),
    excludedProductCategoryIds: idListField.optional(),
    emailRestrictions: emailListField.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;
export type CouponParams = z.infer<typeof couponParamsSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
