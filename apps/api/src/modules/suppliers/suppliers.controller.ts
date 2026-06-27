import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { paginate } from "../../lib/paginate";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toBatchDto } from "../digital-inventory/digital-inventory.serializer";
import {
  archiveSupplier,
  createSupplier,
  getSupplierDetails,
  linkSupplierProduct,
  listSupplierBatches,
  listSupplierProducts,
  listSuppliers,
  unlinkSupplierProduct,
  updateSupplier,
  updateSupplierProduct,
} from "./suppliers.service";
import {
  toSupplierDto,
  toSupplierProductDto,
} from "./suppliers.serializer";
import type {
  CreateSupplierInput,
  CreateSupplierProductInput,
  ListSuppliersQuery,
  MappingParams,
  SupplierParams,
  UpdateSupplierInput,
  UpdateSupplierProductInput,
} from "./suppliers.schemas";

/** GET /suppliers (digital_suppliers.view). */
export async function listSuppliersHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListSuppliersQuery;
  const result = await listSuppliers(storeId, query);
  res.status(200).json(
    successResponse({
      items: result.items,
      pagination: paginate(result.total, result.page, result.limit),
    }),
  );
}

/** GET /suppliers/:id (digital_suppliers.view). */
export async function getSupplierHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const { supplier, metrics } = await getSupplierDetails(storeId, id);
  res.status(200).json(
    successResponse({ ...toSupplierDto(supplier), metrics }),
  );
}

/** POST /suppliers (digital_suppliers.create). */
export async function createSupplierHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const body = req.body as CreateSupplierInput;
  const supplier = await createSupplier(storeId, body);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_CREATED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: supplier.id,
    message: `أنشأ مورّداً: ${supplier.name}`,
    metadata: { supplierId: supplier.id, status: supplier.status },
  });
  res.status(201).json(successResponse(toSupplierDto(supplier), "Supplier created"));
}

/** PATCH /suppliers/:id (digital_suppliers.edit). */
export async function updateSupplierHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const body = req.body as UpdateSupplierInput;
  const { supplier } = await updateSupplier(storeId, id, body);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: supplier.id,
    message: `حدّث مورّداً: ${supplier.name}`,
    metadata: { supplierId: supplier.id, changedFields: Object.keys(body) },
  });
  res.status(200).json(successResponse(toSupplierDto(supplier), "Supplier updated"));
}

/** DELETE /suppliers/:id — archive (digital_suppliers.delete). */
export async function deleteSupplierHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const supplier = await archiveSupplier(storeId, id);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_ARCHIVED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: supplier.id,
    message: `أرشف مورّداً: ${supplier.name}`,
    metadata: { supplierId: supplier.id },
  });
  res.status(200).json(successResponse(toSupplierDto(supplier), "Supplier archived"));
}

/** GET /suppliers/:id/products (digital_suppliers.view). */
export async function listSupplierProductsHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const rows = await listSupplierProducts(storeId, id);
  res.status(200).json(successResponse({ items: rows.map(toSupplierProductDto) }));
}

/** POST /suppliers/:id/products (digital_suppliers.edit). */
export async function linkSupplierProductHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const body = req.body as CreateSupplierProductInput;
  const row = await linkSupplierProduct(storeId, id, body);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_PRODUCT_LINKED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: id,
    message: "ربط منتجاً بمورّد",
    metadata: { supplierId: id, productId: row.productId, mappingId: row.id },
  });
  res.status(201).json(successResponse(toSupplierProductDto(row), "Product linked"));
}

/** PATCH /suppliers/:id/products/:mappingId (digital_suppliers.edit). */
export async function updateSupplierProductHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id, mappingId } = req.params as MappingParams;
  const body = req.body as UpdateSupplierProductInput;
  const row = await updateSupplierProduct(storeId, id, mappingId, body);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_PRODUCT_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: id,
    message: "حدّث ربط منتج بمورّد",
    metadata: { supplierId: id, mappingId, changedFields: Object.keys(body) },
  });
  res.status(200).json(successResponse(toSupplierProductDto(row), "Mapping updated"));
}

/** DELETE /suppliers/:id/products/:mappingId (digital_suppliers.edit). */
export async function unlinkSupplierProductHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id, mappingId } = req.params as MappingParams;
  await unlinkSupplierProduct(storeId, id, mappingId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SUPPLIER_PRODUCT_UNLINKED,
    entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
    entityId: id,
    message: "ألغى ربط منتج بمورّد",
    metadata: { supplierId: id, mappingId },
  });
  res.status(200).json(successResponse({ id: mappingId }, "Mapping removed"));
}

/** GET /suppliers/:id/batches (digital_suppliers.view). */
export async function listSupplierBatchesHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as SupplierParams;
  const batches = await listSupplierBatches(storeId, id);
  res.status(200).json(
    successResponse({ items: batches.map((b) => toBatchDto(b, null)) }),
  );
}
