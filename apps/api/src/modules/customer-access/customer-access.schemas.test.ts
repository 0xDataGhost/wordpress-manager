import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupSchema, revealSchema } from "./customer-access.schemas";

const TOKEN = "x".repeat(43);
const CODE = "11111111-1111-1111-1111-111111111111";

test("lookupSchema requires a token and rejects unknown keys", () => {
  assert.equal(lookupSchema.safeParse({ token: TOKEN }).success, true);
  assert.equal(lookupSchema.safeParse({}).success, false);
  assert.equal(lookupSchema.safeParse({ token: "short" }).success, false);
  assert.equal(
    lookupSchema.safeParse({ token: TOKEN, extra: "nope" }).success,
    false,
  );
});

test("revealSchema validates token + codeId and defaults action to viewed", () => {
  const parsed = revealSchema.parse({ token: TOKEN, codeId: CODE });
  assert.equal(parsed.action, "viewed");

  assert.equal(
    revealSchema.safeParse({ token: TOKEN, codeId: CODE, action: "copied" }).success,
    true,
  );
  assert.equal(
    revealSchema.safeParse({ token: TOKEN, codeId: "not-a-uuid" }).success,
    false,
  );
  assert.equal(
    revealSchema.safeParse({ token: TOKEN, codeId: CODE, action: "delete" }).success,
    false,
  );
  assert.equal(
    revealSchema.safeParse({ token: TOKEN, codeId: CODE, extra: 1 }).success,
    false,
  );
});
