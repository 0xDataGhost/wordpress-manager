/**
 * Public DTOs for the customer self-service portal (Phase 22).
 *
 * SECURITY: the lookup view exposes ONLY masked previews + ids. No field here
 * carries a cipher, iv, tag, fingerprint hash, or raw/decrypted code. The full
 * code is returned ONLY by the dedicated reveal endpoint, one code at a time.
 */

/** A single delivered code as seen on the public page (masked until revealed). */
export interface PublicCodeItem {
  /** The digital code id — used by the reveal call; not sensitive. */
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

/** A row of the delivered-assignments lookup query (masked — no cipher/code). */
export interface PublicCodeRow {
  codeId: string;
  codePreview: string | null;
  productId: string | null;
  productName: string | null;
  instructions: string | null;
}

/** Groups delivered codes by product into the public order view. */
export function toPublicOrderView(
  orderNumber: string | null,
  storeName: string,
  rows: PublicCodeRow[],
): PublicOrderView {
  const groups = new Map<string, PublicProductGroup>();
  for (const row of rows) {
    const key = row.productId ?? `__noproduct__:${row.productName ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        productName: row.productName,
        instructions: row.instructions,
        codes: [],
      };
      groups.set(key, group);
    }
    group.codes.push({ id: row.codeId, codePreview: row.codePreview });
  }
  return { orderNumber, storeName, items: [...groups.values()] };
}
