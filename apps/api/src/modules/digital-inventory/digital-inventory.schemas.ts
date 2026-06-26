import { z } from "zod";
import {
  CODE_BATCH_SOURCES,
  CODE_BATCH_STATUSES,
} from "../../db/schema/code-batches";
import { DIGITAL_CODE_STATUSES } from "../../db/schema/digital-codes";

/**
 * Validation for the Phase 16 digital inventory API. Codes themselves are NEVER
 * accepted back from the client except as the raw import text; everything else
 * works on ids/filters. No raw code is ever returned or logged.
 */

/* --------------------------------- Import -------------------------------- */

export const importCodesSchema = z.object({
  productId: z.string().uuid(),
  // Optional supplier the batch was purchased from (Phase 20). Must be active.
  supplierId: z.string().uuid().optional(),
  batchName: z.string().trim().max(200).optional(),
  // The raw codes, one per line. Parsed/normalized server-side; never stored raw.
  codesText: z.string().min(1, "Provide at least one code"),
  source: z.enum(CODE_BATCH_SOURCES).default("manual_import"),
  costPerCode: z.number().nonnegative().max(99_999_999.9999).optional(),
  currency: z.string().trim().max(8).optional(),
  // ISO datetime or null; coerced to a Date.
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
});

export type ImportCodesInput = z.infer<typeof importCodesSchema>;

/* ------------------------------- List / read ----------------------------- */

export const listCodesQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.enum(DIGITAL_CODE_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  // Inclusive upper bound on expiry (YYYY-MM-DD): match codes that have an
  // expiry on/before this date. Codes with no expiry are excluded.
  expiresBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCodesQuery = z.infer<typeof listCodesQuerySchema>;

export const summaryQuerySchema = z.object({
  productId: z.string().uuid().optional(),
});

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const listBatchesQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  status: z.enum(CODE_BATCH_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;

export const codeParamsSchema = z.object({ id: z.string().uuid() });
export type CodeParams = z.infer<typeof codeParamsSchema>;

export const batchParamsSchema = z.object({ id: z.string().uuid() });
export type BatchParams = z.infer<typeof batchParamsSchema>;

/* ----------------------------- Status update ----------------------------- */

/**
 * Statuses an operator may set directly through the status endpoint. The
 * lifecycle states `available`/`reserved`/`sold`/`delivered`/`replacement` are
 * engine-driven (Phases 17–19), and `refunded` only ever comes from the (later)
 * refund workflow — none may be set here. All three settable targets are
 * destructive, so a reason is always required.
 */
export const MANUAL_STATUS_TARGETS = ["voided", "invalid", "expired"] as const;

/** Destructive statuses that always require a reason (plan2 §16). */
export const DESTRUCTIVE_STATUSES = [
  "voided",
  "invalid",
  "refunded",
  "expired",
] as const;

export const updateCodeStatusSchema = z.object({
  status: z.enum(MANUAL_STATUS_TARGETS),
  // Required (all settable targets are destructive). Never logged in audit.
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

export type UpdateCodeStatusInput = z.infer<typeof updateCodeStatusSchema>;

/**
 * Allowed manual status transitions (plan2 §16). The key is the current status;
 * the value lists the statuses an operator may move it to. Anything not listed
 * is rejected — in particular nothing transitions to `refunded` here, and
 * `delivered`/`replacement`/terminal states have no manual transitions.
 */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  available: ["voided", "invalid", "expired"],
  reserved: ["voided"],
  sold: ["invalid"],
};

/** Statuses reachable from `from` via a manual status change. */
export function getAllowedTransitions(from: string): readonly string[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/** True when `from -> to` is an allowed manual transition. */
export function isTransitionAllowed(from: string, to: string): boolean {
  return getAllowedTransitions(from).includes(to);
}

/** True when a status is destructive (and therefore requires a reason). */
export function isDestructiveStatus(status: string): boolean {
  return (DESTRUCTIVE_STATUSES as readonly string[]).includes(status);
}
