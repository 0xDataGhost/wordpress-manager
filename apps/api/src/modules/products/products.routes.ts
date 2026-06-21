import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createProductHandler,
  deleteProductHandler,
  getProductHandler,
  listProductsHandler,
  publishProductHandler,
  updateProductHandler,
} from "./products.controller";
import {
  createProductSchema,
  listProductsQuerySchema,
  productParamsSchema,
  updateProductSchema,
} from "./products.schemas";

const router = Router();

// GET /products            — list (search/filter/pagination)
router.get(
  "/",
  authenticate,
  requirePermission("products.view"),
  validate({ query: listProductsQuerySchema }),
  asyncHandler(listProductsHandler),
);

// GET /products/:id        — details
router.get(
  "/:id",
  authenticate,
  requirePermission("products.view"),
  validate({ params: productParamsSchema }),
  asyncHandler(getProductHandler),
);

// POST /products           — create
router.post(
  "/",
  authenticate,
  requirePermission("products.create"),
  validate({ body: createProductSchema }),
  asyncHandler(createProductHandler),
);

// PATCH /products/:id      — update
router.patch(
  "/:id",
  authenticate,
  requirePermission("products.edit"),
  validate({ params: productParamsSchema, body: updateProductSchema }),
  asyncHandler(updateProductHandler),
);

// DELETE /products/:id     — archive (soft delete)
router.delete(
  "/:id",
  authenticate,
  requirePermission("products.delete"),
  validate({ params: productParamsSchema }),
  asyncHandler(deleteProductHandler),
);

// POST /products/:id/publish — publish foundation to WooCommerce
router.post(
  "/:id/publish",
  authenticate,
  requirePermission("products.edit"),
  validate({ params: productParamsSchema }),
  asyncHandler(publishProductHandler),
);

export default router;
