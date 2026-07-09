/**
 * Coupons API client for the Phase 28 coupons management screen.
 *
 * Each function calls a real backend route from the coupons module
 * (mounted at /api/v1/coupons) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listCoupons   → GET    /coupons       (JWT, coupons.view)
 *   getCoupon     → GET    /coupons/:id   (JWT, coupons.view)
 *   createCoupon  → POST   /coupons       (JWT, coupons.manage)
 *   updateCoupon  → PUT    /coupons/:id   (JWT, coupons.manage)
 *   deleteCoupon  → DELETE /coupons/:id   (JWT, coupons.manage)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly. A
 * 409 (duplicate code) from create/update comes through the same channel.
 */

import { apiRequest } from "./http";

/** Canonical discount types — kept in sync with the backend coupons module. */
export const COUPON_DISCOUNT_TYPE_VALUES = [
  "percent",
  "fixed_cart",
  "fixed_product",
] as const;

export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPE_VALUES)[number];

export interface CouponDto {
  id: string;
  /** WooCommerce coupon id; null before the coupon is published. */
  wpCouponId: number | null;
  code: string;
  discountType: CouponDiscountType;
  /** Decimal string (exact money/percentage), matching the backend column. */
  amount: string;
  description: string | null;
  freeShipping: boolean;
  usageCount: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  /** ISO date (YYYY-MM-DD) or full timestamp; null when the coupon never expires. */
  dateExpires: string | null;
  restrictions: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CouponListResult {
  items: CouponDto[];
  pagination: CouponPagination;
}

export interface CouponListQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Create body. Numeric fields are numbers (not strings). Restriction lists
 * (products/categories/emails) are optional and omitted by the MVP dialog.
 */
export interface CouponCreateInput {
  code: string;
  discountType: CouponDiscountType;
  amount: number;
  description?: string | null;
  freeShipping: boolean;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  dateExpires?: string | null;
  minimumAmount?: number | null;
  maximumAmount?: number | null;
  individualUse: boolean;
  excludeSaleItems: boolean;
  productIds?: number[];
  excludedProductIds?: number[];
  productCategoryIds?: number[];
  excludedProductCategoryIds?: number[];
  emailRestrictions?: string[];
}

/**
 * Update body — every field optional, but the backend requires at least one.
 * Keys the dialog does not touch (restriction lists) are simply omitted so the
 * backend preserves the coupon's existing values.
 */
export type CouponUpdateInput = Partial<CouponCreateInput>;

export async function listCoupons(
  query: CouponListQuery = {},
): Promise<CouponListResult> {
  return apiRequest<CouponListResult>("/coupons", {
    method: "GET",
    query: {
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getCoupon(id: string): Promise<CouponDto> {
  return apiRequest<CouponDto>(`/coupons/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function createCoupon(
  input: CouponCreateInput,
): Promise<CouponDto> {
  return apiRequest<CouponDto>("/coupons", {
    method: "POST",
    body: input,
  });
}

export async function updateCoupon(
  id: string,
  input: CouponUpdateInput,
): Promise<CouponDto> {
  return apiRequest<CouponDto>(`/coupons/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: input,
  });
}

export async function deleteCoupon(id: string): Promise<void> {
  await apiRequest<void>(`/coupons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
