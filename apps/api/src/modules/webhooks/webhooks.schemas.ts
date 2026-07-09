import { z } from "zod";
import {
  wooCouponSchema,
  wooCustomerSchema,
  wooOrderSchema,
  wooProductSchema,
  wooReviewSchema,
} from "../sync/sync.schemas";

/**
 * Zod schemas for the incremental-sync webhooks the WordPress connector POSTs to
 * the SaaS (Phase 13). Each event carries a normalized entity payload that
 * matches the manual-sync schemas exactly, so webhook processing reuses the same
 * idempotent upsert path as the manual pull. Everything is validated at this
 * boundary — webhook payloads are external data and are never trusted.
 *
 * Envelope shape sent by the connector:
 *   {
 *     "event":      "order.created",        // the webhook topic
 *     "eventId":    "<idempotency key>",     // unique per delivery
 *     "externalId": "1001",                  // the WooCommerce id of the entity
 *     "occurredAt": "2026-06-24T10:00:00Z",  // optional, informational
 *     "data":       { ...normalized entity }  // omitted only for *.deleted
 *   }
 */

/** Every webhook topic the SaaS understands, grouped by entity below. */
export const WEBHOOK_EVENT_TYPES = [
  "product.created",
  "product.updated",
  "product.deleted",
  "order.created",
  "order.updated",
  "customer.created",
  "customer.updated",
  "coupon.created",
  "coupon.updated",
  "coupon.deleted",
  "review.created",
  "review.updated",
  "review.deleted",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** The entity families a webhook endpoint can target. */
export type WebhookEntity =
  | "product"
  | "order"
  | "customer"
  | "coupon"
  | "review";

/**
 * Idempotency key. Accepts a string or number (the connector may send either),
 * normalizes to a trimmed string and bounds the length. This becomes
 * webhook_events.external_event_id and is the duplicate-suppression key.
 */
const eventIdField = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length >= 1 && value.length <= 255, {
    message: "eventId must be a non-empty string up to 255 characters",
  });

/** The WooCommerce id of the affected entity, normalized to a trimmed string. */
const externalIdField = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length >= 1 && value.length <= 64, {
    message: "externalId must be a non-empty string up to 64 characters",
  });

/** Informational origin timestamp; stored in the raw payload, not required. */
const occurredAtField = z.string().trim().max(40).optional();

/**
 * Echo marker (Phase 25): set by the connector when the change that fired this
 * webhook was caused by a SaaS command (the connector round-trips the
 * X-Saas-Command-Id it received). A matching command is confirmed instead of
 * re-processing the event as an external change. Non-UUID values are treated
 * as absent — never trusted into a uuid column.
 */
const originCommandIdField = z.string().uuid().optional();

/** Entity version (date_modified) reported by WordPress; informational. */
const entityVersionField = z.string().trim().max(64).optional();

/**
 * Product webhook. `data` is required for created/updated (carries the full
 * normalized product) and optional for deleted (only externalId is needed to
 * locate and archive the local row).
 */
export const productWebhookSchema = z
  .object({
    event: z.enum(["product.created", "product.updated", "product.deleted"]),
    eventId: eventIdField,
    externalId: externalIdField,
    occurredAt: occurredAtField,
    originCommandId: originCommandIdField,
    entityVersion: entityVersionField,
    data: wooProductSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event !== "product.deleted" && !value.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "data is required for product.created and product.updated",
      });
    }
  });

/** Order webhook. `data` (the full normalized order) is always required. */
export const orderWebhookSchema = z.object({
  event: z.enum(["order.created", "order.updated"]),
  eventId: eventIdField,
  externalId: externalIdField,
  occurredAt: occurredAtField,
  originCommandId: originCommandIdField,
  entityVersion: entityVersionField,
  data: wooOrderSchema,
});

/** Customer webhook. `data` (the full normalized customer) is always required. */
export const customerWebhookSchema = z.object({
  event: z.enum(["customer.created", "customer.updated"]),
  eventId: eventIdField,
  externalId: externalIdField,
  occurredAt: occurredAtField,
  originCommandId: originCommandIdField,
  entityVersion: entityVersionField,
  data: wooCustomerSchema,
});

/** Coupon webhook. `data` required for created/updated, optional for deleted. */
export const couponWebhookSchema = z
  .object({
    event: z.enum(["coupon.created", "coupon.updated", "coupon.deleted"]),
    eventId: eventIdField,
    externalId: externalIdField,
    occurredAt: occurredAtField,
    originCommandId: originCommandIdField,
    entityVersion: entityVersionField,
    data: wooCouponSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event !== "coupon.deleted" && !value.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "data is required for coupon.created and coupon.updated",
      });
    }
  });

/** Review webhook. `data` required for created/updated, optional for deleted. */
export const reviewWebhookSchema = z
  .object({
    event: z.enum(["review.created", "review.updated", "review.deleted"]),
    eventId: eventIdField,
    externalId: externalIdField,
    occurredAt: occurredAtField,
    originCommandId: originCommandIdField,
    entityVersion: entityVersionField,
    data: wooReviewSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event !== "review.deleted" && !value.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "data is required for review.created and review.updated",
      });
    }
  });

/** Query for GET /wp/webhooks (recent events for the store). */
export const listWebhookEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProductWebhookInput = z.infer<typeof productWebhookSchema>;
export type OrderWebhookInput = z.infer<typeof orderWebhookSchema>;
export type CustomerWebhookInput = z.infer<typeof customerWebhookSchema>;
export type CouponWebhookInput = z.infer<typeof couponWebhookSchema>;
export type ReviewWebhookInput = z.infer<typeof reviewWebhookSchema>;
export type ListWebhookEventsQuery = z.infer<
  typeof listWebhookEventsQuerySchema
>;

/** Discriminated input union accepted by the webhook service. */
export type WebhookInput =
  | ProductWebhookInput
  | OrderWebhookInput
  | CustomerWebhookInput
  | CouponWebhookInput
  | ReviewWebhookInput;
