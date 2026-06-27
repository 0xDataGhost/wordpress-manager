import assert from "node:assert/strict";
import { test } from "node:test";
import { isTokenAccessible, resolveLinkStatus } from "./customer-access.policy";

const NOW = 1_700_000_000_000;
const future = new Date(NOW + 86_400_000);
const past = new Date(NOW - 86_400_000);

test("isTokenAccessible: active link is accessible", () => {
  assert.equal(
    isTokenAccessible(
      { expiresAt: future, revokedAt: null, maxUses: 1, usedCount: 0 },
      NOW,
    ),
    true,
  );
});

test("isTokenAccessible: revoked and expired links are not accessible", () => {
  assert.equal(
    isTokenAccessible(
      { expiresAt: future, revokedAt: new Date(NOW), maxUses: 1, usedCount: 0 },
      NOW,
    ),
    false,
  );
  assert.equal(
    isTokenAccessible(
      { expiresAt: past, revokedAt: null, maxUses: 1, usedCount: 0 },
      NOW,
    ),
    false,
  );
});

test("isTokenAccessible ignores max_uses (that gates reveals, not access)", () => {
  assert.equal(
    isTokenAccessible(
      { expiresAt: future, revokedAt: null, maxUses: 1, usedCount: 1 },
      NOW,
    ),
    true,
  );
});

test("resolveLinkStatus reflects the full lifecycle", () => {
  assert.equal(
    resolveLinkStatus({ expiresAt: future, revokedAt: null, maxUses: 1, usedCount: 0 }, NOW),
    "active",
  );
  assert.equal(
    resolveLinkStatus({ expiresAt: future, revokedAt: new Date(NOW), maxUses: null, usedCount: 0 }, NOW),
    "revoked",
  );
  assert.equal(
    resolveLinkStatus({ expiresAt: past, revokedAt: null, maxUses: null, usedCount: 0 }, NOW),
    "expired",
  );
  assert.equal(
    resolveLinkStatus({ expiresAt: future, revokedAt: null, maxUses: 1, usedCount: 1 }, NOW),
    "exhausted",
  );
  // Unlimited (maxUses null) never becomes exhausted.
  assert.equal(
    resolveLinkStatus({ expiresAt: future, revokedAt: null, maxUses: null, usedCount: 999 }, NOW),
    "active",
  );
});
