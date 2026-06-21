import { z } from "zod";
import { PRODUCT_STATUSES } from "../../db/schema/products";

// Shared field validators. Optional/nullable variations are applied per schema.
const nameField = z.string().trim().min(2).max(200);
const descriptionField = z.string().trim().max(5000);
const shortDescriptionField = z.string().trim().max(500);
const priceField = z.number().nonnegative().max(99_999_999.99);
const stockField = z.number().int().min(0).max(1_000_000);
const statusField = z.enum(PRODUCT_STATUSES);
const imageUrlField = z.string().trim().url().max(2048);

/** Body for POST /products. */
export const createProductSchema = z.object({
  name: nameField,
  description: descriptionField.nullish(),
  shortDescription: shortDescriptionField.nullish(),
  price: priceField.default(0),
  stockQuantity: stockField.default(0),
  status: statusField.default("draft"),
  imageUrl: imageUrlField.nullish(),
});

/**
 * Body for PATCH /products/:id. Every field is optional; an omitted field is
 * left unchanged while an explicit `null` clears a nullable column. At least one
 * field must be present.
 */
export const updateProductSchema = z
  .object({
    name: nameField.optional(),
    description: descriptionField.nullish(),
    shortDescription: shortDescriptionField.nullish(),
    price: priceField.optional(),
    stockQuantity: stockField.optional(),
    status: statusField.optional(),
    imageUrl: imageUrlField.nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update",
  });

/** Query for GET /products (search + filter + pagination). */
export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: statusField.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Route params carrying a product id. */
export const productParamsSchema = z.object({
  id: z.string().uuid(),
});

/** A single product pushed from the WordPress connector during a sync. */
const connectorProductSchema = z.object({
  wpProductId: z.number().int().positive(),
  name: nameField,
  description: descriptionField.nullish(),
  shortDescription: shortDescriptionField.nullish(),
  price: priceField.default(0),
  stockQuantity: stockField.default(0),
  status: statusField.default("active"),
  imageUrl: imageUrlField.nullish(),
});

/** Body for POST /wp/products/sync (connector-authenticated upsert). */
export const connectorSyncSchema = z.object({
  products: z.array(connectorProductSchema).min(1).max(100),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductParams = z.infer<typeof productParamsSchema>;
export type ConnectorProductInput = z.infer<typeof connectorProductSchema>;
export type ConnectorSyncInput = z.infer<typeof connectorSyncSchema>;
