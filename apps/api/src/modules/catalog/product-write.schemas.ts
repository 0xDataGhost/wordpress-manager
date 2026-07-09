import { z } from "zod";
import { PRODUCT_STATUSES } from "../../db/schema/products";

/** Body for DELETE /products/:id/wp — trash by default, force to hard-delete. */
export const deleteProductWpSchema = z.object({
  force: z.boolean().default(false),
});

/** A WooCommerce product variation payload (create/update). */
export const variationSchema = z.object({
  regularPrice: z.number().nonnegative().max(99_999_999.99).optional(),
  salePrice: z.number().nonnegative().max(99_999_999.99).nullish(),
  stockQuantity: z.number().int().min(0).max(1_000_000).nullish(),
  status: z.enum(["publish", "private"]).optional(),
  // Attribute selection: WooCommerce attribute name -> option value.
  attributes: z.record(z.string().max(200), z.string().max(200)).optional(),
  imageUrl: z.string().trim().url().max(2048).nullish(),
});

export const variationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const variationTermParamsSchema = z.object({
  id: z.string().uuid(),
  variationId: z.coerce.number().int().positive(),
});

/** Media sideload: a source URL the connector imports into the media library. */
export const createMediaSchema = z.object({
  sourceUrl: z.string().trim().url().max(2048),
  // Optional product to attach the resulting attachment to (featured/gallery).
  attachToWpProductId: z.number().int().positive().optional(),
  asFeatured: z.boolean().default(false),
  altText: z.string().trim().max(500).optional(),
});

/** Bulk product operation (bounded batch — plan3 Phase 26). */
const BULK_MAX = 50;

const bulkItemSchema = z.object({
  wpProductId: z.number().int().positive(),
  regularPrice: z.number().nonnegative().max(99_999_999.99).optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
});

export const bulkUpdateProductsSchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(BULK_MAX),
});

export type DeleteProductWpInput = z.infer<typeof deleteProductWpSchema>;
export type VariationInput = z.infer<typeof variationSchema>;
export type VariationParams = z.infer<typeof variationParamsSchema>;
export type VariationTermParams = z.infer<typeof variationTermParamsSchema>;
export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type BulkUpdateProductsInput = z.infer<typeof bulkUpdateProductsSchema>;
