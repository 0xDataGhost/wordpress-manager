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

/**
 * Phase 17 — Code Assignment & Reservation Engine. JWT-authenticated and
 * tenant-scoped. Reading the queue/assignments needs `digital_delivery.view`;
 * triggering assignment needs `digital_delivery.assign`. No code is ever revealed
 * here (assignment only) — delivery is Phase 18.
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

export default router;
