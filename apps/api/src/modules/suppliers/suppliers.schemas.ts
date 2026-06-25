import { z } from "zod";
import { SUPPLIER_STATUSES } from "../../db/schema/suppliers";

/**
 * Validation for the Phase 20 suppliers module. Tenant scope + permissions are
 * applied by the routes/service; these schemas validate shape at the boundary.
 */

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const nameField = z.string().trim().min(2, "اسم المورد مطلوب").max(200);
// `.nullish()` so an absent key is allowed (undefined) and a blank string → null.
const optText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullish());
const optEmail = z.preprocess(
  emptyToNull,
  z.string().trim().toLowerCase().email().max(200).nullish(),
);
const optUrl = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((v) => /^https?:\/\//i.test(v), "Website must be an http(s) URL")
    .nullish(),
);
const optCurrency = z.preprocess(
  emptyToNull,
  z.string().trim().max(8).nullish(),
);

const supplierFields = {
  name: nameField,
  contactName: optText(200),
  email: optEmail,
  phone: optText(40),
  website: optUrl,
  country: optText(80),
  currency: optCurrency,
  notes: optText(2000),
  status: z.enum(SUPPLIER_STATUSES),
  isPreferred: z.boolean(),
};

/** Body for POST /suppliers. */
export const createSupplierSchema = z
  .object({
    ...supplierFields,
    status: z.enum(SUPPLIER_STATUSES).default("active"),
    isPreferred: z.boolean().default(false),
  })
  .strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

/** Body for PATCH /suppliers/:id — partial; at least one field. */
export const updateSupplierSchema = z
  .object(supplierFields)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "Provide at least one field to update",
  });

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersQuerySchema = z.object({
  status: z.enum(SUPPLIER_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export const supplierParamsSchema = z.object({ id: z.string().uuid() });
export type SupplierParams = z.infer<typeof supplierParamsSchema>;

export const mappingParamsSchema = z.object({
  id: z.string().uuid(),
  mappingId: z.string().uuid(),
});
export type MappingParams = z.infer<typeof mappingParamsSchema>;

const costField = z.number().nonnegative().max(99_999_999.99);
const qtyField = z.number().int().min(0).max(1_000_000);

/** Body for POST /suppliers/:id/products. */
export const createSupplierProductSchema = z
  .object({
    productId: z.string().uuid(),
    supplierSku: optText(120),
    costPrice: costField.optional(),
    currency: optCurrency,
    minOrderQuantity: qtyField.optional(),
    leadTimeDays: qtyField.optional(),
    notes: optText(2000),
  })
  .strict();
export type CreateSupplierProductInput = z.infer<
  typeof createSupplierProductSchema
>;

/** Body for PATCH /suppliers/:id/products/:mappingId — partial; at least one field. */
export const updateSupplierProductSchema = z
  .object({
    supplierSku: optText(120),
    costPrice: costField.optional(),
    currency: optCurrency,
    minOrderQuantity: qtyField.optional(),
    leadTimeDays: qtyField.optional(),
    notes: optText(2000),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateSupplierProductInput = z.infer<
  typeof updateSupplierProductSchema
>;
