import { z } from "zod";

/**
 * Validation for the staff-facing customer-link endpoints (Phase 22). Staff
 * generate/list/revoke the signed links; the raw token is returned only once by
 * the create endpoint and never accepted back from the client.
 *
 * NOTE: the input bound here is a coarse sanity cap (365); the service clamps the
 * effective lifetime to the configured `CUSTOMER_LINK_MAX_TTL_DAYS`. Keeping env
 * out of this schema lets it be unit-tested without booting the env validator.
 */

export const createCustomerLinkSchema = z
  .object({
    // Lifetime in days; omitted = server default. Service clamps to the max.
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
    // Max code reveals: a positive integer, or `null` for unlimited (opt-in).
    // Omitted = server default (a single-use link).
    maxUses: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  })
  .strict();

export type CreateCustomerLinkInput = z.infer<typeof createCustomerLinkSchema>;

export const customerLinkParamsSchema = z.object({ id: z.string().uuid() });
export type CustomerLinkParams = z.infer<typeof customerLinkParamsSchema>;
