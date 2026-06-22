import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

// A valid 32-byte key (hex). The module reads process.env lazily on each call,
// so setting it here (before the tests run) is enough.
process.env.CONNECTOR_ENCRYPTION_KEY = randomBytes(32).toString("hex");

import {
  encryptSecret,
  decryptSecret,
  isOutboundEncryptionConfigured,
} from "./connector-crypto";

test("isOutboundEncryptionConfigured is true when the key is set", () => {
  assert.equal(isOutboundEncryptionConfigured(), true);
});

test("encrypt then decrypt round-trips the plaintext", () => {
  const plaintext = "wpc_0123456789abcdef_s3cr3t-value_AAA";
  const encrypted = encryptSecret(plaintext);
  assert.ok(encrypted, "expected ciphertext when key is configured");
  // Ciphertext must not equal the plaintext and each part is base64.
  assert.notEqual(encrypted.cipher, plaintext);
  assert.match(encrypted.iv, /^[A-Za-z0-9+/=]+$/);
  assert.match(encrypted.tag, /^[A-Za-z0-9+/=]+$/);

  assert.equal(decryptSecret(encrypted), plaintext);
});

test("two encryptions of the same plaintext use distinct nonces", () => {
  const a = encryptSecret("same-secret");
  const b = encryptSecret("same-secret");
  assert.ok(a && b);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.cipher, b.cipher);
});

test("decrypt rejects a tampered ciphertext (GCM auth tag)", () => {
  const encrypted = encryptSecret("tamper-me");
  assert.ok(encrypted);
  // Flip the ciphertext: authentication must fail on decrypt.
  const tampered = {
    ...encrypted,
    cipher: Buffer.from("totally-different-bytes").toString("base64"),
  };
  assert.throws(() => decryptSecret(tampered));
});
