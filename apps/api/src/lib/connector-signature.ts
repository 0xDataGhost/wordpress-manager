import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC request signing for SaaS -> WordPress calls.
 *
 * Byte-for-byte compatible with the connector plugin's PHP
 * `Saas_Connector_Signature`: the signed message binds the timestamp to the body
 * as "{timestamp}.{body}" and the digest is base64(HMAC-SHA256). The plugin
 * verifies inbound SaaS requests with the SAME shared secret (the connector API
 * key), so this is what lets the SaaS publish products and pull WooCommerce data.
 */

export const SIGNATURE_HEADER = "X-Saas-Signature";
export const TIMESTAMP_HEADER = "X-Saas-Timestamp";

/** base64(HMAC-SHA256("{timestamp}.{body}", secret)). */
export function signMessage(
  timestamp: string,
  body: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("base64");
}

/** Builds the signature headers for an outbound request body. */
export function signatureHeaders(
  body: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const timestamp = String(nowSeconds);
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signMessage(timestamp, body, secret),
  };
}

/** Constant-time verification, for completeness/parity and future inbound use. */
export function verifySignature(
  signature: string,
  timestamp: string,
  body: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signMessage(timestamp, body, secret), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
