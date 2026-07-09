import { z } from "zod";
import { ORDER_STATUSES } from "../../db/schema/orders";

const statusField = z.enum(ORDER_STATUSES);

/**
 * Query for GET /orders (search + status filter + date range + pagination).
 *
 * `search` matches the order number or — when a customer is linked — the
 * customer name/email/phone. `dateFrom`/`dateTo` filter on the order date
 * (placed-at, falling back to created-at) as inclusive YYYY-MM-DD bounds.
 */
export const listOrdersQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    status: statusField.optional(),
    // Inclusive date bounds (YYYY-MM-DD). dateTo covers the whole day.
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.dateFrom || !data.dateTo || data.dateFrom.getTime() <= data.dateTo.getTime(),
    { message: "dateFrom must be on or before dateTo", path: ["dateFrom"] },
  );

/** Route params carrying an order id. */
export const orderParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Body for PATCH /orders/:id/notes. `internalNotes` may be cleared with an empty
 * string or null. Trimmed and length-capped; notes are dashboard-only and never
 * pushed back to WooCommerce.
 */
export const updateOrderNotesSchema = z.object({
  internalNotes: z.string().trim().max(5000).nullish(),
});

/**
 * Body for PUT /orders/:id/status — a WooCommerce status transition (Phase 27).
 * The transition executes in WordPress through the command outbox; the mirror
 * row updates from the connector's response.
 */
export const updateOrderStatusSchema = z.object({
  status: statusField,
});

/** Body for POST /orders/:id/wp-notes — a WooCommerce order note (Phase 27). */
export const addOrderWpNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  // True = customer-facing note (WooCommerce may email it); false = private.
  customerNote: z.boolean().default(false),
});

/**
 * Body for POST /orders/:id/refunds (Phase 27, money-sensitive).
 * `refundPayment` moves real money at the gateway and additionally requires the
 * orders.refund_payment permission (checked in the controller — it depends on
 * the body). Amount is validated here for shape and again server-side (SaaS and
 * connector) against the remaining refundable amount.
 */
export const createOrderRefundSchema = z.object({
  amount: z.number().positive().max(99_999_999.99),
  reason: z.string().trim().max(500).optional(),
  refundPayment: z.boolean().default(false),
  restockItems: z.boolean().default(false),
  // Money-safety (Phase 32 audit fix): a stable, client-generated key that
  // survives retries of the SAME logical refund (a re-submitted request after
  // a timeout/dropped response). The connector keys its WooCommerce refund on
  // this before any gateway call, so a retry finds the existing refund instead
  // of moving money twice. Absent (older client) → the server mints one, which
  // still prevents concurrent double-submits via the DB in-flight guard.
  idempotencyKey: z.string().uuid().optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderParams = z.infer<typeof orderParamsSchema>;
export type UpdateOrderNotesInput = z.infer<typeof updateOrderNotesSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type AddOrderWpNoteInput = z.infer<typeof addOrderWpNoteSchema>;
export type CreateOrderRefundInput = z.infer<typeof createOrderRefundSchema>;
