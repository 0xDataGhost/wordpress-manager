import { z } from "zod";

/**
 * Validation for the PUBLIC customer self-service endpoints (Phase 22). The token
 * is always carried in the request BODY (never the URL) so it cannot leak through
 * access logs, the Referer header, or browser history. Bodies are `.strict()` so
 * unknown keys are rejected.
 */

// base64url of 32 bytes is ~43 chars; allow a generous range without leaking the
// exact length. Validation failures map to the same generic rejection.
const tokenField = z.string().trim().min(20).max(512);

export const lookupSchema = z
  .object({
    token: tokenField,
  })
  .strict();

export type LookupInput = z.infer<typeof lookupSchema>;

export const revealSchema = z
  .object({
    token: tokenField,
    codeId: z.string().uuid(),
    // `viewed` decrypts and returns the code (consumes a use); `copied` only
    // records that the already-revealed code was copied (no decrypt, no use).
    action: z.enum(["viewed", "copied"]).default("viewed"),
  })
  .strict();

export type RevealInput = z.infer<typeof revealSchema>;
