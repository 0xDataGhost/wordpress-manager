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

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerParams = z.infer<typeof customerParamsSchema>;
export type UpdateCustomerNotesInput = z.infer<
  typeof updateCustomerNotesSchema
>;
