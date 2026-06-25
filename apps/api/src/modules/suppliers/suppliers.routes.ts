import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createSupplierHandler,
  deleteSupplierHandler,
  getSupplierHandler,
  linkSupplierProductHandler,
  listSupplierBatchesHandler,
  listSupplierProductsHandler,
  listSuppliersHandler,
  unlinkSupplierProductHandler,
  updateSupplierHandler,
  updateSupplierProductHandler,
} from "./suppliers.controller";
import {
  createSupplierProductSchema,
  createSupplierSchema,
  listSuppliersQuerySchema,
  mappingParamsSchema,
  supplierParamsSchema,
  updateSupplierProductSchema,
  updateSupplierSchema,
} from "./suppliers.schemas";

/**
 * Phase 20 — Suppliers & Batch Cost Tracking. JWT-authenticated, tenant-scoped.
 * Reading needs `digital_suppliers.view`; creating `.create`; editing (incl.
 * product mappings) `.edit`; archiving `.delete`. Suppliers hold no secrets.
 */
const router = Router();

const view = requirePermission("digital_suppliers.view");
const edit = requirePermission("digital_suppliers.edit");

// GET /suppliers
router.get(
  "/",
  authenticate,
  view,
  validate({ query: listSuppliersQuerySchema }),
  asyncHandler(listSuppliersHandler),
);

// POST /suppliers
router.post(
  "/",
  authenticate,
  requirePermission("digital_suppliers.create"),
  validate({ body: createSupplierSchema }),
  asyncHandler(createSupplierHandler),
);

// GET /suppliers/:id
router.get(
  "/:id",
  authenticate,
  view,
  validate({ params: supplierParamsSchema }),
  asyncHandler(getSupplierHandler),
);

// PATCH /suppliers/:id
router.patch(
  "/:id",
  authenticate,
  edit,
  validate({ params: supplierParamsSchema, body: updateSupplierSchema }),
  asyncHandler(updateSupplierHandler),
);

// DELETE /suppliers/:id — archive
router.delete(
  "/:id",
  authenticate,
  requirePermission("digital_suppliers.delete"),
  validate({ params: supplierParamsSchema }),
  asyncHandler(deleteSupplierHandler),
);

// GET /suppliers/:id/products
router.get(
  "/:id/products",
  authenticate,
  view,
  validate({ params: supplierParamsSchema }),
  asyncHandler(listSupplierProductsHandler),
);

// POST /suppliers/:id/products
router.post(
  "/:id/products",
  authenticate,
  edit,
  validate({ params: supplierParamsSchema, body: createSupplierProductSchema }),
  asyncHandler(linkSupplierProductHandler),
);

// PATCH /suppliers/:id/products/:mappingId
router.patch(
  "/:id/products/:mappingId",
  authenticate,
  edit,
  validate({ params: mappingParamsSchema, body: updateSupplierProductSchema }),
  asyncHandler(updateSupplierProductHandler),
);

// DELETE /suppliers/:id/products/:mappingId
router.delete(
  "/:id/products/:mappingId",
  authenticate,
  edit,
  validate({ params: mappingParamsSchema }),
  asyncHandler(unlinkSupplierProductHandler),
);

// GET /suppliers/:id/batches
router.get(
  "/:id/batches",
  authenticate,
  view,
  validate({ params: supplierParamsSchema }),
  asyncHandler(listSupplierBatchesHandler),
);

export default router;
