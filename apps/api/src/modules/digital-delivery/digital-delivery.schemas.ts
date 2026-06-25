import { z } from "zod";

/**
 * Validation for the Phase 17 assignment engine endpoints. The engine works on
 * orders/products by id and never accepts or returns raw code material.
 */

/**
 * Body for POST /digital-delivery/orders/:orderId/assign. Phase 17 supports the
 * automatic engine only (`mode: "auto"`); hand-picking a specific code is a
 * Phase 19 support tool. `allowPartial` lets the engine assign what stock exists
 * (the remainder is flagged for manual review) instead of failing outright.
 */
export const assignOrderSchema = z.object({
  mode: z.enum(["auto"]).default("auto"),
  allowPartial: z.boolean().default(true),
  reason: z.string().trim().max(500).optional(),
});

export type AssignOrderInput = z.infer<typeof assignOrderSchema>;

export const orderParamsSchema = z.object({ orderId: z.string().uuid() });
export type OrderParams = z.infer<typeof orderParamsSchema>;

/** Statuses the delivery queue can be filtered by (plan2 §17). */
export const QUEUE_STATUSES = [
  "pending",
  "partial",
  "failed",
  "manual_review",
  "completed",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const queueQuerySchema = z.object({
  status: z.enum(QUEUE_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;
