/**
 * Public customer self-service API client (Phase 22).
 *
 * These calls hit the PUBLIC portal endpoints (mounted at /api/v1/public) and are
 * made WITHOUT a Bearer token (`auth: false`) — the access token in the body is
 * the only credential. The token is carried in the body (never the URL) so it
 * cannot leak through logs, the Referer header, or browser history.
 *
 *   lookupOrder   → POST /public/digital-orders/lookup  (masked previews only)
 *   revealCode    → POST /public/digital-orders/reveal  (action: viewed → full code)
 *   logCodeCopied → POST /public/digital-orders/reveal  (action: copied → log only)
 *
 * SECURITY: a full code is returned only by `revealCode`. No list response carries
 * a raw code; previews are masked.
 */

import { apiRequest } from "./http";

export interface PublicCodeItem {
  /** Digital code id used by the reveal call; not sensitive. */
  id: string;
  /** Masked preview only (e.g. "ABCD••••WXYZ"); never the full code. */
  codePreview: string | null;
}

export interface PublicProductGroup {
  productName: string | null;
  instructions: string | null;
  codes: PublicCodeItem[];
}

export interface PublicOrderView {
  orderNumber: string | null;
  storeName: string;
  items: PublicProductGroup[];
}

export interface RevealResult {
  codeId: string;
  /** Present only for a `viewed` reveal. */
  code?: string;
}

export async function lookupOrder(token: string): Promise<PublicOrderView> {
  return apiRequest<PublicOrderView>("/public/digital-orders/lookup", {
    method: "POST",
    body: { token },
    auth: false,
  });
}

export async function revealCode(
  token: string,
  codeId: string,
): Promise<RevealResult> {
  return apiRequest<RevealResult>("/public/digital-orders/reveal", {
    method: "POST",
    body: { token, codeId, action: "viewed" },
    auth: false,
  });
}

/** Records that a revealed code was copied (no code returned). Best-effort. */
export async function logCodeCopied(
  token: string,
  codeId: string,
): Promise<RevealResult> {
  return apiRequest<RevealResult>("/public/digital-orders/reveal", {
    method: "POST",
    body: { token, codeId, action: "copied" },
    auth: false,
  });
}
