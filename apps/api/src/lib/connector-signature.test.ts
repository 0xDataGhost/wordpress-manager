import assert from "node:assert/strict";
import { test } from "node:test";
import {
  signMessage,
  signatureHeaders,
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "./connector-signature";

// Mirrors the PHP connector: base64(hmac_sha256("{timestamp}.{body}", secret)).
test("signMessage is deterministic, base64, and round-trips through verify", () => {
  const sig = signMessage("1700000000", "body", "secret");
  // Stable for fixed inputs (the PHP connector recomputes the same value).
  assert.equal(sig, signMessage("1700000000", "body", "secret"));
  // base64 of a 32-byte SHA-256 digest is 44 chars.
  assert.match(sig, /^[A-Za-z0-9+/]{43}=$/);
  assert.equal(verifySignature(sig, "1700000000", "body", "secret"), true);
});

test("signatureHeaders carries the timestamp and a matching signature", () => {
  const headers = signatureHeaders("the-body", "the-secret", 1700000000);
  assert.equal(headers[TIMESTAMP_HEADER], "1700000000");
  assert.equal(
    headers[SIGNATURE_HEADER],
    signMessage("1700000000", "the-body", "the-secret"),
  );
});

test("verifySignature rejects a wrong secret, body, or timestamp", () => {
  const sig = signMessage("1700000000", "body", "secret");
  assert.equal(verifySignature(sig, "1700000000", "body", "wrong"), false);
  assert.equal(verifySignature(sig, "1700000000", "tampered", "secret"), false);
  assert.equal(verifySignature(sig, "1700000001", "body", "secret"), false);
});

test("empty body (GET requests) signs and verifies", () => {
  const headers = signatureHeaders("", "secret", 1700000000);
  assert.equal(
    verifySignature(
      headers[SIGNATURE_HEADER] as string,
      "1700000000",
      "",
      "secret",
    ),
    true,
  );
});
