import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toProductDto } from "../products/products.serializer";
import type { ProductParams } from "../products/products.schemas";
import {
  bulkUpdateProducts,
  createMedia,
  createVariation,
  deleteProductInWp,
  deleteVariation,
  updateVariation,
} from "./product-write.service";
import type {
  BulkUpdateProductsInput,
  CreateMediaInput,
  DeleteProductWpInput,
  VariationInput,
  VariationTermParams,
} from "./product-write.schemas";

export async function createVariationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const input = req.body as VariationInput;
  const result = await createVariation(storeId, id, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_VARIATION_SAVED,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: id,
    message: "أنشأ متغيّراً لمنتج في ووردبريس",
    metadata: { wpVariationId: result.wpVariationId },
  });
  res.status(201).json(successResponse(result, "Variation created"));
}

export async function updateVariationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id, variationId } = req.params as unknown as VariationTermParams;
  const input = req.body as VariationInput;
  const result = await updateVariation(storeId, id, variationId, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_VARIATION_SAVED,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: id,
    message: "حدّث متغيّراً لمنتج في ووردبريس",
    metadata: { wpVariationId: variationId },
  });
  res.status(200).json(successResponse(result, "Variation updated"));
}

export async function deleteVariationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id, variationId } = req.params as unknown as VariationTermParams;
  await deleteVariation(storeId, id, variationId, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_VARIATION_DELETED,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: id,
    message: "حذف متغيّراً لمنتج في ووردبريس",
    metadata: { wpVariationId: variationId },
  });
  res.status(204).send();
}

export async function createMediaHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as CreateMediaInput;
  const result = await createMedia(storeId, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_MEDIA_ATTACHED,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: input.attachToWpProductId
      ? String(input.attachToWpProductId)
      : null,
    message: "استورد صورة إلى مكتبة وسائط ووردبريس",
    metadata: {
      wpAttachmentId: result.wpAttachmentId,
      attachedToWpProductId: result.attachedToWpProductId,
      asFeatured: result.asFeatured,
    },
  });
  res.status(201).json(successResponse(result, "Media imported"));
}

export async function bulkUpdateProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as BulkUpdateProductsInput;
  const result = await bulkUpdateProducts(storeId, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_BULK_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: null,
    message: `تحديث جماعي لمنتجات ووردبريس: ${result.succeeded}/${result.total} نجحت`,
    metadata: {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
    },
  });
  res.status(200).json(successResponse(result, "Bulk update applied"));
}

export async function deleteProductWpHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const { force } = req.body as DeleteProductWpInput;
  const result = await deleteProductInWp(storeId, id, force, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.PRODUCT_DELETED_WP,
    entityType: AUDIT_ENTITY_TYPES.PRODUCT,
    entityId: result.product.id,
    message: force
      ? `حذف منتجاً نهائياً من ووردبريس: ${result.product.name}`
      : `نقل منتجاً إلى المهملات في ووردبريس: ${result.product.name}`,
    metadata: { wpProductId: result.product.wpProductId, forced: force },
  });
  res
    .status(200)
    .json(successResponse(toProductDto(result.product), "Product deleted"));
}
