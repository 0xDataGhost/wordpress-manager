import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

/**
 * Symmetric encryption for the connector API key at rest.
 *
 * The connector authenticates TO the SaaS with its key (we store only a SHA-256
 * hash of it for inbound verification — see lib/api-key). For the REVERSE
 * direction (SaaS -> WordPress: product publish and WooCommerce pull sync) the
 * SaaS must present a signature the WordPress plugin can verify, and the plugin
 * verifies with the SAME key as the shared HMAC secret. The SaaS therefore needs
 * the plaintext key to sign outbound requests.
 *
 * Keeping the plaintext in the database would mean a DB dump leaks live keys, so
 * the key is encrypted with AES-256-GCM using a server-side secret that lives
 * only in the environment (CONNECTOR_ENCRYPTION_KEY), never in the database.
 * GCM is authenticated, so tampering with the ciphertext is detected on
 * decrypt. The key material is never returned in any API response.
 */

const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM

export interface EncryptedSecret {
  cipher: string; // base64 ciphertext
  iv: string; // base64 nonce
  tag: string; // base64 GCM auth tag
}

/**
 * Resolves the 32-byte encryption key from the environment. Accepts 64 hex
 * chars or base64. Returns null when not configured, so callers can degrade
 * gracefully (outbound delivery disabled) instead of crashing.
 */
function getEncryptionKey(): Buffer | null {
  // Read directly from process.env (not the parsed `env` object) so this
  // security primitive stays decoupled from full app-env validation and is
  // independently unit-testable. The variable is also declared in config/env so
  // it is documented and validated at boot; dotenv has populated process.env by
  // the time any outbound delivery runs.
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) return null;

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CONNECTOR_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Provide 64 hex chars or 32 bytes base64.",
    );
  }
  return key;
}

/** Whether outbound SaaS -> WordPress delivery is configured. */
export function isOutboundEncryptionConfigured(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * Encrypts a plaintext secret. Returns null when encryption is not configured,
 * letting the caller persist no cipher material and keep outbound delivery off.
 */
export function encryptSecret(plaintext: string): EncryptedSecret | null {
  const key = getEncryptionKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypts a previously encrypted secret. Throws when encryption is not
 * configured or the ciphertext/tag fails authentication (tampering or wrong key).
 */
export function decryptSecret(payload: EncryptedSecret): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY is not configured");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipher, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
