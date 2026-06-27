import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CustomerTokenError,
  accessTokenHashEquals,
  accessTokenRateKey,
  generateAccessToken,
  hashAccessToken,
  isCustomerTokenConfigured,
} from "./customer-token";

const KEY = "test-customer-token-hash-key-please-change";

function withKey<T>(fn: () => T): T {
  const prev = process.env.CUSTOMER_TOKEN_HASH_KEY;
  process.env.CUSTOMER_TOKEN_HASH_KEY = KEY;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CUSTOMER_TOKEN_HASH_KEY;
    else process.env.CUSTOMER_TOKEN_HASH_KEY = prev;
  }
}

test("generateAccessToken produces high-entropy, unique, URL-safe tokens", () => {
  const a = generateAccessToken();
  const b = generateAccessToken();
  assert.notEqual(a, b);
  // base64url of 32 bytes ≈ 43 chars; never contains +, /, or =.
  assert.ok(a.length >= 40);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("hashAccessToken is deterministic and distinguishes tokens", () => {
  withKey(() => {
    const token = generateAccessToken();
    assert.equal(hashAccessToken(token), hashAccessToken(token));
    assert.notEqual(hashAccessToken(token), hashAccessToken(generateAccessToken()));
    // hex digest, never the raw token
    assert.match(hashAccessToken(token), /^[0-9a-f]{64}$/);
    assert.notEqual(hashAccessToken(token), token);
  });
});

test("hashAccessToken depends on the secret (key separation)", () => {
  const token = generateAccessToken();
  const h1 = withKey(() => hashAccessToken(token));
  process.env.CUSTOMER_TOKEN_HASH_KEY = "a-completely-different-secret-value";
  const h2 = hashAccessToken(token);
  delete process.env.CUSTOMER_TOKEN_HASH_KEY;
  assert.notEqual(h1, h2);
});

test("hashAccessToken throws a safe error when the key is missing", () => {
  const prev = process.env.CUSTOMER_TOKEN_HASH_KEY;
  delete process.env.CUSTOMER_TOKEN_HASH_KEY;
  try {
    assert.equal(isCustomerTokenConfigured(), false);
    const token = generateAccessToken();
    assert.throws(
      () => hashAccessToken(token),
      (err: unknown) =>
        err instanceof CustomerTokenError && !err.message.includes(token),
    );
  } finally {
    if (prev !== undefined) process.env.CUSTOMER_TOKEN_HASH_KEY = prev;
  }
});

test("accessTokenHashEquals is length-safe and correct", () => {
  assert.equal(accessTokenHashEquals("abc", "abc"), true);
  assert.equal(accessTokenHashEquals("abc", "abd"), false);
  assert.equal(accessTokenHashEquals("abc", "abcd"), false);
});

test("accessTokenRateKey is a non-reversible fingerprint, not the token", () => {
  const token = generateAccessToken();
  const key = accessTokenRateKey(token);
  assert.notEqual(key, token);
  assert.equal(accessTokenRateKey(token), accessTokenRateKey(token));
  assert.match(key, /^[0-9a-f]+$/);
});
