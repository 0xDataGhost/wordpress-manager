/**
 * Generates cryptographically-secure values for the secrets the API needs, in the
 * EXACT format the code expects, and prints copy/paste-ready env lines to stdout.
 *
 *   Run:  npm run secrets:generate     (from apps/api)
 *
 * SAFETY
 *   - NEVER writes to .env and NEVER reads or prints existing/real values.
 *   - Values come from Node's CSPRNG (crypto.randomBytes) only.
 *   - Copy the lines you need into apps/api/.env (git-ignored). Do NOT commit them.
 *
 * KEY FORMATS — confirmed against the parsing code, do not change without checking:
 *   - DIGITAL_CODE_ENCRYPTION_KEY / CONNECTOR_ENCRYPTION_KEY
 *       AES-256 keys. lib/digital-code-crypto + lib/connector-crypto accept
 *       64 hex chars OR base64, and require the value to decode to exactly
 *       32 bytes. Emitted here as 64 hex chars (unambiguous + .env-safe).
 *   - DIGITAL_CODE_HASH_KEY
 *       Used verbatim as the HMAC-SHA256 secret (no decoding / no fixed length).
 *       Emitted as a 48-byte random hex string for strong entropy.
 *   - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
 *       Signing secrets; the schema requires >= 32 chars. Emitted as 48-byte hex
 *       (96 chars), distinct per type.
 *
 * ⚠️  ROTATION WARNING — read before regenerating in an environment with real data:
 *   - DIGITAL_CODE_ENCRYPTION_KEY: once digital codes are imported, rotating this
 *       key makes ALL stored ciphertext permanently undecryptable (codes lost).
 *       Set it ONCE, up front. NEVER rotate after the first real import.
 *   - DIGITAL_CODE_HASH_KEY: rotating it changes every duplicate fingerprint, so
 *       previously imported codes no longer dedupe against new imports.
 *       NEVER rotate after the first real import.
 *   - CONNECTOR_ENCRYPTION_KEY: rotating it makes stored connector-key ciphertext
 *       undecryptable; every connected store must re-generate its API key from the
 *       dashboard afterwards. Avoid rotating unless you also re-connect all stores.
 *   - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: safe to rotate — it only invalidates
 *       existing sessions (users simply re-login).
 */

import { randomBytes } from "node:crypto";

/** 32 bytes as 64 hex chars — decodes to exactly 32 bytes (AES-256). */
const aes256Hex = (): string => randomBytes(32).toString("hex");

/** 48 bytes as 96 hex chars — a strong signing/HMAC secret. */
const strongHex = (): string => randomBytes(48).toString("hex");

const lines = [
  "# ─────────────────────────────────────────────────────────────────────────",
  "# Generated secrets — copy the lines you need into apps/api/.env (git-ignored).",
  "# Do NOT commit them. See the rotation warning in src/scripts/generate-secrets.ts.",
  "# ─────────────────────────────────────────────────────────────────────────",
  "",
  "# AES-256 key (32 bytes). NEVER rotate after real digital codes are imported.",
  `DIGITAL_CODE_ENCRYPTION_KEY=${aes256Hex()}`,
  "# HMAC-SHA256 secret (used as-is). NEVER rotate after real digital codes exist.",
  `DIGITAL_CODE_HASH_KEY=${strongHex()}`,
  "# AES-256 key (32 bytes). Rotating orphans stored connector keys — re-connect stores after.",
  `CONNECTOR_ENCRYPTION_KEY=${aes256Hex()}`,
  "# JWT signing secrets (>=32 chars). Safe to rotate (invalidates sessions).",
  `JWT_ACCESS_SECRET=${strongHex()}`,
  `JWT_REFRESH_SECRET=${strongHex()}`,
  "",
];

process.stdout.write(lines.join("\n") + "\n");
