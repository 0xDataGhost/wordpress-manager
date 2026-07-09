import { z } from "zod";

/**
 * Zod schemas for the WooCommerce data the SaaS pulls from the connector during
 * a manual sync. The connector returns already-normalized camelCase objects; the
 * SaaS still validates everything at this boundary (never trust external data)
 * before upserting. Money arrives as a number or a numeric string and is
 * normalized to a 2-decimal string to match the numeric DB columns.
 */

// Upper bound matches the numeric(12,2) DB columns (max 9,999,999,999.99), so an
// out-of-range Woo value fails cleanly as validation instead of as a DB overflow.
const MONEY_MAX = 9_999_999_999.99;

/** A non-negative money value as number|string, normalized to "0.00" form. */
const moneyField = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const num = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isFinite(num) || num < 0 || num > MONEY_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid money value" });
      return z.NEVER;
    }
    return num.toFixed(2);
  });

/** A positive integer id arriving as number|string. */
const wpIdField = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const num = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isInteger(num) || num <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid WordPress id" });
      return z.NEVER;
    }
    return num;
  });

const optionalWpId = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isInteger(num) && num > 0 ? num : null;
  });

const intField = z
  .union([z.number(), z.string()])
  .transform((value) => {
    const num = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
  });

const isoDateField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  });

/** A WooCommerce product image. */
export const wooImageSchema = z.object({
  wpImageId: optionalWpId,
  src: z.string().trim().url().max(2048),
  alt: z.string().trim().max(500).nullish(),
});

/**
 * Entity version token (unix timestamp of date_modified as a string). Stored
 * verbatim and echoed back as the compare-and-set token on write-back commands.
 */
const versionField = z.string().trim().max(64).nullish();

/** A WooCommerce product pulled from the connector. */
export const wooProductSchema = z.object({
  wpProductId: wpIdField,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(50_000).nullish(),
  shortDescription: z.string().trim().max(5_000).nullish(),
  price: moneyField.default("0"),
  stockQuantity: intField.default(0),
  // Raw WooCommerce status (publish/draft/pending/private); mapped on our side.
  status: z.string().trim().max(20).default("publish"),
  images: z.array(wooImageSchema).max(50).default([]),
  dateModified: versionField,
});

/** A WooCommerce customer pulled from the connector. */
export const wooCustomerSchema = z.object({
  wpCustomerId: wpIdField,
  name: z.string().trim().max(200).default(""),
  email: z.string().trim().max(320).nullish(),
  phone: z.string().trim().max(64).nullish(),
  totalSpent: moneyField.default("0"),
  ordersCount: intField.default(0),
  lastOrderAt: isoDateField,
});

/** A single line on a WooCommerce order. */
export const wooLineItemSchema = z.object({
  wpProductId: optionalWpId,
  name: z.string().trim().max(200).default(""),
  sku: z.string().trim().max(120).nullish(),
  quantity: intField.default(1),
  price: moneyField.default("0"),
  total: moneyField.default("0"),
});

/** A WooCommerce coupon pulled from the connector (Phase 28/31). */
export const wooCouponSchema = z.object({
  wpCouponId: wpIdField,
  code: z.string().trim().min(1).max(100),
  discountType: z.string().trim().max(40).default("fixed_cart"),
  amount: moneyField.default("0"),
  description: z.string().trim().max(5000).nullish(),
  freeShipping: z.coerce.boolean().default(false),
  usageCount: intField.default(0),
  usageLimit: optionalWpId,
  usageLimitPerUser: optionalWpId,
  dateExpires: z.string().trim().max(40).nullish(),
  restrictions: z.record(z.string(), z.unknown()).nullish(),
  dateModified: versionField,
});

/** A WooCommerce product review pulled from the connector (Phase 29/31). */
export const wooReviewSchema = z.object({
  wpReviewId: wpIdField,
  wpProductId: optionalWpId,
  productName: z.string().trim().max(300).nullish(),
  author: z.string().trim().max(200).nullish(),
  authorEmail: z.string().trim().max(320).nullish(),
  rating: intField.default(0),
  content: z.string().trim().max(5000).nullish(),
  status: z.string().trim().max(20).default("hold"),
  dateCreated: z.string().trim().max(40).nullish(),
  dateModified: versionField,
});

/** A WooCommerce order refund summary (Phase 27). */
export const wooRefundSchema = z.object({
  wpRefundId: wpIdField,
  amount: moneyField.default("0"),
  reason: z.string().trim().max(500).nullish(),
  refundedPayment: z.coerce.boolean().default(false),
  dateCreated: isoDateField,
});

/** A WooCommerce order pulled from the connector. */
export const wooOrderSchema = z.object({
  wpOrderId: wpIdField,
  orderNumber: z.string().trim().max(64).nullish(),
  status: z.string().trim().max(40).default("pending"),
  total: moneyField.default("0"),
  currency: z.string().trim().max(8).default("SAR"),
  paymentMethod: z.string().trim().max(120).nullish(),
  // Woo customer id; 0/guest maps to null.
  wpCustomerId: optionalWpId,
  placedAt: isoDateField,
  lineItems: z.array(wooLineItemSchema).max(500).default([]),
  // Phase 27: refund mirror + compare-and-set token. Older connectors omit
  // these; the defaults keep the shared upsert path backward compatible.
  totalRefunded: moneyField.default("0"),
  refunds: z.array(wooRefundSchema).max(200).default([]),
  dateModified: versionField,
});

/** The connector returns `{ items: [...], page, totalPages }` for each entity. */
export function wooPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema).default([]),
    page: z.coerce.number().int().min(1).default(1),
    totalPages: z.coerce.number().int().min(0).default(1),
  });
}

export type WooProduct = z.infer<typeof wooProductSchema>;
export type WooCustomer = z.infer<typeof wooCustomerSchema>;
export type WooOrder = z.infer<typeof wooOrderSchema>;
export type WooLineItem = z.infer<typeof wooLineItemSchema>;
export type WooRefund = z.infer<typeof wooRefundSchema>;
export type WooCouponPayload = z.infer<typeof wooCouponSchema>;
export type WooReviewPayload = z.infer<typeof wooReviewSchema>;

/** Body for POST /wp/sync — the connector asks the SaaS to run a manual sync. */
export const wpSyncTriggerSchema = z.object({
  entity: z.enum(["product", "order", "customer", "all"]).default("all"),
});

export type WpSyncTriggerInput = z.infer<typeof wpSyncTriggerSchema>;
