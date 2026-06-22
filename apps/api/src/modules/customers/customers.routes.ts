import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  getCustomerHandler,
  listCustomersHandler,
  updateCustomerNotesHandler,
} from "./customers.controller";
import {
  customerParamsSchema,
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
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

export default router;
