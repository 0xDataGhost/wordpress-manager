import type { CouponRow } from "../../db/schema/coupons";

export interface CouponDto {
  id: string;
  wpCouponId: number | null;
  code: string;
  discountType: string;
  amount: string;
  description: string | null;
  freeShipping: boolean;
  usageCount: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  dateExpires: Date | null;
  restrictions: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toCouponDto(row: CouponRow): CouponDto {
  return {
    id: row.id,
    wpCouponId: row.wpCouponId,
    code: row.code,
    discountType: row.discountType,
    amount: row.amount,
    description: row.description,
    freeShipping: row.freeShipping,
    usageCount: row.usageCount,
    usageLimit: row.usageLimit,
    usageLimitPerUser: row.usageLimitPerUser,
    dateExpires: row.dateExpires,
    restrictions:
      row.restrictions && typeof row.restrictions === "object"
        ? (row.restrictions as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
