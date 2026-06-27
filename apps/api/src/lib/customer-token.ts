import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cryptographic primitives for customer self-service access tokens (Phase 22).
 *
 * A token is a 256-bit random secret embedded in the link handed to a customer.
 * It is NEVER stored or logged. Only a keyed HMAC-SHA256 fingerprint is persisted
 * (`customer_access_tokens.token_hash`), looked up with a constant-time compare.
 *
 * The HMAC secret is a DEDICATED key (CUSTOMER_TOKEN_HASH_KEY) — it must NOT be
 * the digital-code fingerprint key (DIGITAL_CODE_HASH_KEY); reusing a key across
 * purposes is avoided on principle. Like the digital-code module, a missing key
 * THROWS a safe error rather than silently degrading.
 */

const HASH_KEY_ENV = "CUSTOMER_TOKEN_HASH_KEY";
const TOKEN_BYTES = 32; // 256-bit

/** Raised for any customer-token failure. Carries only a safe message. */
export class CustomerTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerTokenError";
  }
}

/** Resolves the dedicated HMAC secret. Throws a safe error when missing. */
function getHashKey(): string {
  const raw = process.env[HASH_KEY_ENV];
  if (!raw) {
    throw new CustomerTokenError(`${HASH_KEY_ENV} is not configured`);
  }
  return raw;
}

/** True when the token hash key is present. Never throws — for a boot/use gate. */
export function isCustomerTokenConfigured(): boolean {
  try {
    getHashKey();
    return true;
  } catch {
    return false;
  }
}

/** Generates a 256-bit URL-safe random token (the raw secret, never stored). */
export function generateAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Keyed HMAC-SHA256 fingerprint of a token (hex). Deterministic, irreversible. */
export function hashAccessToken(token: string): string {
  return createHmac("sha256", getHashKey()).update(token, "utf8").digest("hex");
}

/**
 * Unkeyed SHA-256 fingerprint of a token, used ONLY as a rate-limit bucket key
 * (so a single leaked link can be throttled across IPs) — decoupled from the HMAC
 * secret so the limiter never needs it. Never stored; one-way; not the auth hash.
 */
export function accessTokenRateKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 32);
}

/** Constant-time comparison of two hex fingerprints (no timing leak). */
export function accessTokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
