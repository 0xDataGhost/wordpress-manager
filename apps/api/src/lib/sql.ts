/**
 * Shared SQL helpers used across modules.
 *
 * Keeping a single definition of LIKE/ILIKE escaping avoids the previous drift
 * risk of the same security-relevant helper being copy-pasted into every list
 * service (products / orders / customers).
 */

/**
 * Escapes LIKE/ILIKE wildcards so user-supplied search text matches literally.
 * Backslash itself is escaped first so the `\%` / `\_` sequences are safe.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
