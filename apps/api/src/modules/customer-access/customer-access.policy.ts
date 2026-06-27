/**
 * Pure token-policy helpers for the customer self-service portal (Phase 22).
 * Side-effect free so the validity rules are unit-tested in isolation.
 *
 * Two distinct notions:
 *  - `isTokenAccessible` gates the non-consuming actions (lookup, copy-log): the
 *    token must be unrevoked and unexpired. It deliberately does NOT consider
 *    `max_uses` — that budget governs reveals only.
 *  - `resolveLinkStatus` is the staff-facing display status (adds `exhausted`).
 *
 * The reveal endpoint enforces `max_uses` atomically in SQL (not here), so the
 * used-count check is race-safe at the database, never via a read-then-write.
 */

export type LinkStatus = "active" | "revoked" | "expired" | "exhausted";

export interface TokenPolicyView {
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  usedCount: number;
}

/** True when the token may be used for non-consuming access (lookup / copy log). */
export function isTokenAccessible(
  token: TokenPolicyView,
  now: number = Date.now(),
): boolean {
  if (token.revokedAt) return false;
  if (token.expiresAt.getTime() <= now) return false;
  return true;
}

/** Staff-facing lifecycle status of a link. */
export function resolveLinkStatus(
  token: TokenPolicyView,
  now: number = Date.now(),
): LinkStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt.getTime() <= now) return "expired";
  if (token.maxUses !== null && token.usedCount >= token.maxUses) {
    return "exhausted";
  }
  return "active";
}
