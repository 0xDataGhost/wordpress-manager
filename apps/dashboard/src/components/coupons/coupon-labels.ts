import type { CouponDiscountType } from "@/lib/coupons-api";
import { COUPON_DISCOUNT_TYPE_VALUES } from "@/lib/coupons-api";

/** Arabic label for each WooCommerce discount type. */
export const DISCOUNT_TYPE_LABELS: Record<CouponDiscountType, string> = {
  percent: "نسبة مئوية",
  fixed_cart: "مبلغ ثابت على السلة",
  fixed_product: "مبلغ ثابت على المنتج",
};

/** Ordered options for the discount-type select control. */
export const DISCOUNT_TYPE_OPTIONS: {
  value: CouponDiscountType;
  label: string;
}[] = COUPON_DISCOUNT_TYPE_VALUES.map((value) => ({
  value,
  label: DISCOUNT_TYPE_LABELS[value],
}));
