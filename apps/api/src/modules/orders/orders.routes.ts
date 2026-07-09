import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  getOrderHandler,
  listOrdersHandler,
  updateOrderNotesHandler,
} from "./orders.controller";
import {
  addOrderWpNoteHandler,
  createOrderRefundHandler,
  listOrderRefundsHandler,
  listOrderWpNotesHandler,
  updateOrderStatusHandler,
} from "./orders.wp.controller";
import {
  addOrderWpNoteSchema,
  createOrderRefundSchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  updateOrderNotesSchema,
  updateOrderStatusSchema,
} from "./orders.schemas";

const router = Router();

// GET /orders            — list (search/status/date/pagination)
router.get(
  "/",
  authenticate,
  requirePermission("orders.view"),
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(listOrdersHandler),
);

// GET /orders/:id        — details (order + items + customer summary)
router.get(
  "/:id",
  authenticate,
  requirePermission("orders.view"),
  validate({ params: orderParamsSchema }),
  asyncHandler(getOrderHandler),
);

// PATCH /orders/:id/notes — update internal notes
router.patch(
  "/:id/notes",
  authenticate,
  requirePermission("orders.edit"),
  validate({ params: orderParamsSchema, body: updateOrderNotesSchema }),
  asyncHandler(updateOrderNotesHandler),
);

// ---- Phase 27: order write-back to WooCommerce (via the command outbox) ----

// PUT /orders/:id/status — change the order status in WooCommerce.
router.put(
  "/:id/status",
  authenticate,
  requirePermission("orders.manage_status"),
  validate({ params: orderParamsSchema, body: updateOrderStatusSchema }),
  asyncHandler(updateOrderStatusHandler),
);

// GET /orders/:id/wp-notes — WooCommerce order notes (live read).
router.get(
  "/:id/wp-notes",
  authenticate,
  requirePermission("orders.view"),
  validate({ params: orderParamsSchema }),
  asyncHandler(listOrderWpNotesHandler),
);

// POST /orders/:id/wp-notes — add a WooCommerce order note.
router.post(
  "/:id/wp-notes",
  authenticate,
  requirePermission("orders.add_notes"),
  validate({ params: orderParamsSchema, body: addOrderWpNoteSchema }),
  asyncHandler(addOrderWpNoteHandler),
);

// POST /orders/:id/refunds — create a refund (money-sensitive; refundPayment
// additionally requires orders.refund_payment, checked in the controller).
router.post(
  "/:id/refunds",
  authenticate,
  requirePermission("orders.refund"),
  validate({ params: orderParamsSchema, body: createOrderRefundSchema }),
  asyncHandler(createOrderRefundHandler),
);

// GET /orders/:id/refunds — the order's refunds (mirror).
router.get(
  "/:id/refunds",
  authenticate,
  requirePermission("orders.view"),
  validate({ params: orderParamsSchema }),
  asyncHandler(listOrderRefundsHandler),
);

export default router;
