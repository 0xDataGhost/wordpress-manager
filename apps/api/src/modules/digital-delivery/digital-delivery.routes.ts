import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  assignHandler,
  getAssignmentsHandler,
  queueHandler,
} from "./digital-delivery.controller";
import {
  assignOrderSchema,
  orderParamsSchema,
  queueQuerySchema,
} from "./digital-delivery.schemas";
import {
  deliverHandler,
  getDeliveryHandler,
  listDeliveriesHandler,
  listOrderDeliveriesHandler,
  retryHandler,
} from "./delivery.controller";
import {
  deliverSchema,
  deliveryParamsSchema,
  listDeliveriesQuerySchema,
  retrySchema,
} from "./delivery.schemas";
import {
  manualAssignHandler,
  releaseHandler,
  replaceHandler,
  resendHandler,
  updateAssignmentStatusHandler,
} from "./manual.controller";
import {
  createCustomerLinkHandler,
  listCustomerLinksHandler,
  revokeCustomerLinkHandler,
} from "./customer-link.controller";
import {
  createCustomerLinkSchema,
  customerLinkParamsSchema,
} from "./customer-link.schemas";
import {
  assignmentParamsSchema,
  assignmentStatusSchema,
  manualAssignSchema,
  releaseSchema,
  replaceSchema,
  resendSchema,
} from "./manual.schemas";

/**
 * Phase 17 (assignment) + Phase 18 (delivery). JWT-authenticated and
 * tenant-scoped. Reading needs `digital_delivery.view`; assigning needs
 * `.assign`; delivering needs `.deliver`; retrying needs `.retry`. No raw code is
 * ever returned — delivery transmits a "codes ready" notice only.
 */
const router = Router();

const view = requirePermission("digital_delivery.view");

// GET /digital-delivery/queue — orders needing digital attention
router.get(
  "/queue",
  authenticate,
  view,
  validate({ query: queueQuerySchema }),
  asyncHandler(queueHandler),
);

// POST /digital-delivery/orders/:orderId/assign — run the assignment engine
router.post(
  "/orders/:orderId/assign",
  authenticate,
  requirePermission("digital_delivery.assign"),
  validate({ params: orderParamsSchema, body: assignOrderSchema }),
  asyncHandler(assignHandler),
);

// GET /digital-delivery/orders/:orderId/assignments — masked assignments
router.get(
  "/orders/:orderId/assignments",
  authenticate,
  view,
  validate({ params: orderParamsSchema }),
  asyncHandler(getAssignmentsHandler),
);

/* ----------------------------- Phase 18: delivery ----------------------------- */

// GET /digital-delivery/deliveries — store-wide deliveries list
router.get(
  "/deliveries",
  authenticate,
  view,
  validate({ query: listDeliveriesQuerySchema }),
  asyncHandler(listDeliveriesHandler),
);

// GET /digital-delivery/deliveries/:id — one delivery + its attempts
router.get(
  "/deliveries/:id",
  authenticate,
  view,
  validate({ params: deliveryParamsSchema }),
  asyncHandler(getDeliveryHandler),
);

// POST /digital-delivery/orders/:orderId/deliver — deliver assigned codes
router.post(
  "/orders/:orderId/deliver",
  authenticate,
  requirePermission("digital_delivery.deliver"),
  validate({ params: orderParamsSchema, body: deliverSchema }),
  asyncHandler(deliverHandler),
);

// POST /digital-delivery/orders/:orderId/retry — retry a failed delivery
router.post(
  "/orders/:orderId/retry",
  authenticate,
  requirePermission("digital_delivery.retry"),
  validate({ params: orderParamsSchema, body: retrySchema }),
  asyncHandler(retryHandler),
);

// GET /digital-delivery/orders/:orderId/deliveries — deliveries + attempts for an order
router.get(
  "/orders/:orderId/deliveries",
  authenticate,
  view,
  validate({ params: orderParamsSchema }),
  asyncHandler(listOrderDeliveriesHandler),
);

/* --------------- Phase 19: manual fulfillment / replace / release --------------- */

// POST /digital-delivery/orders/:orderId/manual-assign — assign a specific code
router.post(
  "/orders/:orderId/manual-assign",
  authenticate,
  requirePermission("digital_delivery.assign"),
  validate({ params: orderParamsSchema, body: manualAssignSchema }),
  asyncHandler(manualAssignHandler),
);

// POST /digital-delivery/assignments/:assignmentId/replace — replace a bad code
router.post(
  "/assignments/:assignmentId/replace",
  authenticate,
  requirePermission("digital_delivery.replace"),
  validate({ params: assignmentParamsSchema, body: replaceSchema }),
  asyncHandler(replaceHandler),
);

// POST /digital-delivery/assignments/:assignmentId/resend — resend the same code
router.post(
  "/assignments/:assignmentId/resend",
  authenticate,
  requirePermission("digital_delivery.resend"),
  validate({ params: assignmentParamsSchema, body: resendSchema }),
  asyncHandler(resendHandler),
);

// PATCH /digital-delivery/assignments/:assignmentId/status — cancel/refund/fail one assignment
router.patch(
  "/assignments/:assignmentId/status",
  authenticate,
  requirePermission("digital_delivery.refund"),
  validate({ params: assignmentParamsSchema, body: assignmentStatusSchema }),
  asyncHandler(updateAssignmentStatusHandler),
);

// POST /digital-delivery/orders/:orderId/release — cancel/refund/manual release.
// Money-sensitive (refund/cancel mark codes refunded), so gated by the same
// `digital_delivery.refund` permission as the per-assignment status route — not
// `.retry` — to prevent order-employee/customer-support from issuing refunds.
router.post(
  "/orders/:orderId/release",
  authenticate,
  requirePermission("digital_delivery.refund"),
  validate({ params: orderParamsSchema, body: releaseSchema }),
  asyncHandler(releaseHandler),
);

/* ------------------- Phase 22: customer self-service links ------------------- */

// POST /digital-delivery/orders/:orderId/customer-link — generate a signed link
router.post(
  "/orders/:orderId/customer-link",
  authenticate,
  requirePermission("digital_delivery.customer_link"),
  validate({ params: orderParamsSchema, body: createCustomerLinkSchema }),
  asyncHandler(createCustomerLinkHandler),
);

// GET /digital-delivery/orders/:orderId/customer-links — list links (no token)
router.get(
  "/orders/:orderId/customer-links",
  authenticate,
  view,
  validate({ params: orderParamsSchema }),
  asyncHandler(listCustomerLinksHandler),
);

// POST /digital-delivery/customer-links/:id/revoke — revoke a link
router.post(
  "/customer-links/:id/revoke",
  authenticate,
  requirePermission("digital_delivery.customer_link"),
  validate({ params: customerLinkParamsSchema }),
  asyncHandler(revokeCustomerLinkHandler),
);

export default router;
