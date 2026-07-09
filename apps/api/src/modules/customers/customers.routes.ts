import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  getCustomerHandler,
  listCustomersHandler,
  updateCustomerNotesHandler,
  updateCustomerWpHandler,
} from "./customers.controller";
import {
  customerParamsSchema,
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
  updateCustomerWpSchema,
} from "./customers.schemas";

const router = Router();

// GET /customers            — list (search/pagination)
router.get(
  "/",
  authenticate,
  requirePermission("customers.view"),
  validate({ query: listCustomersQuerySchema }),
  asyncHandler(listCustomersHandler),
);

// GET /customers/:id        — details (profile + metrics + recent orders)
router.get(
  "/:id",
  authenticate,
  requirePermission("customers.view"),
  validate({ params: customerParamsSchema }),
  asyncHandler(getCustomerHandler),
);

// PATCH /customers/:id/notes — update internal notes
router.patch(
  "/:id/notes",
  authenticate,
  requirePermission("customers.edit"),
  validate({ params: customerParamsSchema, body: updateCustomerNotesSchema }),
  asyncHandler(updateCustomerNotesHandler),
);

// PUT /customers/:id — write name/phone/billing/shipping back to WooCommerce.
router.put(
  "/:id",
  authenticate,
  requirePermission("customers.manage"),
  validate({ params: customerParamsSchema, body: updateCustomerWpSchema }),
  asyncHandler(updateCustomerWpHandler),
);

export default router;
