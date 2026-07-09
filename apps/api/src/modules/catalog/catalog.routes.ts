import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createTaxonomyHandler,
  deleteTaxonomyHandler,
  listTaxonomyHandler,
  updateTaxonomyHandler,
} from "./catalog.controller";
import {
  createTaxonomySchema,
  listTaxonomyQuerySchema,
  taxonomyParamsSchema,
  taxonomyTermParamsSchema,
  updateTaxonomySchema,
} from "./catalog.schemas";
import {
  bulkUpdateProductsHandler,
  createMediaHandler,
  createVariationHandler,
  deleteProductWpHandler,
  deleteVariationHandler,
  updateVariationHandler,
} from "./product-write.controller";
import {
  bulkUpdateProductsSchema,
  createMediaSchema,
  deleteProductWpSchema,
  variationSchema,
  variationTermParamsSchema,
} from "./product-write.schemas";
import { productParamsSchema } from "../products/products.schemas";

const router = Router();

// ---- Taxonomies: /catalog/taxonomies/:taxonomy(categories|tags|attributes) ----
router.get(
  "/taxonomies/:taxonomy",
  authenticate,
  requirePermission("products.view"),
  validate({ params: taxonomyParamsSchema, query: listTaxonomyQuerySchema }),
  asyncHandler(listTaxonomyHandler),
);
router.post(
  "/taxonomies/:taxonomy",
  authenticate,
  requirePermission("catalog.manage_taxonomies"),
  validate({ params: taxonomyParamsSchema, body: createTaxonomySchema }),
  asyncHandler(createTaxonomyHandler),
);
router.put(
  "/taxonomies/:taxonomy/:id",
  authenticate,
  requirePermission("catalog.manage_taxonomies"),
  validate({ params: taxonomyTermParamsSchema, body: updateTaxonomySchema }),
  asyncHandler(updateTaxonomyHandler),
);
router.delete(
  "/taxonomies/:taxonomy/:id",
  authenticate,
  requirePermission("catalog.manage_taxonomies"),
  validate({ params: taxonomyTermParamsSchema }),
  asyncHandler(deleteTaxonomyHandler),
);

// ---- Media sideload ----
router.post(
  "/media",
  authenticate,
  requirePermission("products.manage_media"),
  validate({ body: createMediaSchema }),
  asyncHandler(createMediaHandler),
);

// ---- Bulk product operations ----
router.post(
  "/products/bulk",
  authenticate,
  requirePermission("products.edit"),
  validate({ body: bulkUpdateProductsSchema }),
  asyncHandler(bulkUpdateProductsHandler),
);

// ---- Variations: /catalog/products/:id/variations ----
router.post(
  "/products/:id/variations",
  authenticate,
  requirePermission("products.edit"),
  validate({ params: productParamsSchema, body: variationSchema }),
  asyncHandler(createVariationHandler),
);
router.put(
  "/products/:id/variations/:variationId",
  authenticate,
  requirePermission("products.edit"),
  validate({ params: variationTermParamsSchema, body: variationSchema }),
  asyncHandler(updateVariationHandler),
);
router.delete(
  "/products/:id/variations/:variationId",
  authenticate,
  requirePermission("products.edit"),
  validate({ params: variationTermParamsSchema }),
  asyncHandler(deleteVariationHandler),
);

// ---- Delete a product in WooCommerce (trash by default) ----
router.delete(
  "/products/:id/wp",
  authenticate,
  requirePermission("products.delete"),
  validate({ params: productParamsSchema, body: deleteProductWpSchema }),
  asyncHandler(deleteProductWpHandler),
);

export default router;
