import { z } from "zod";

/**
 * Query for GET /customers (search + pagination).
 *
 * `search` matches the customer name, email, or phone (case-insensitive,
 * wildcards escaped in the service).
 */
export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Route params carrying a customer id. */
export const customerParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Body for PATCH /customers/:id/notes. `internalNotes` may be cleared with an
 * empty string or null. Trimmed and length-capped; notes are dashboard-only and
 * never pushed back to WooCommerce.
 */
export const updateCustomerNotesSchema = z.object({
  internalNotes: z.string().trim().max(5000).nullish(),
});

/**
 * Body for PUT /customers/:id (Phase 29). A field-allowlisted write-back to the
 * WooCommerce customer: name, phone and billing/shipping addresses only.
 * Deliberately NO email/password/role — those are WP user administration (a
 * red line, plan3 §11).
 */
const addressSchema = z
  .object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    company: z.string().trim().max(200).optional(),
    address1: z.string().trim().max(300).optional(),
    address2: z.string().trim().max(300).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    postcode: z.string().trim().max(40).optional(),
    country: z.string().trim().max(2).optional(),
    phone: z.string().trim().max(64).optional(),
    email: z.string().trim().email().max(320).optional(),
  })
  .strict();

export const updateCustomerWpSchema = z
  .object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(64).nullish(),
    billing: addressSchema.optional(),
    shipping: addressSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerParams = z.infer<typeof customerParamsSchema>;
export type UpdateCustomerNotesInput = z.infer<
  typeof updateCustomerNotesSchema
>;
export type UpdateCustomerWpInput = z.infer<typeof updateCustomerWpSchema>;
