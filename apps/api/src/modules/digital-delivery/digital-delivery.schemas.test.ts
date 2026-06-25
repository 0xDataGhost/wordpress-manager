import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignOrderSchema,
  queueQuerySchema,
} from "./digital-delivery.schemas";

test("assignOrderSchema applies defaults (auto mode, allowPartial true)", () => {
  const parsed = assignOrderSchema.parse({});
  assert.equal(parsed.mode, "auto");
  assert.equal(parsed.allowPartial, true);
});

test("assignOrderSchema rejects a non-auto mode (manual code-pick is Phase 19)", () => {
  assert.equal(assignOrderSchema.safeParse({ mode: "manual" }).success, false);
});

test("assignOrderSchema accepts an explicit allowPartial + reason", () => {
  const parsed = assignOrderSchema.parse({ allowPartial: false, reason: "x" });
  assert.equal(parsed.allowPartial, false);
  assert.equal(parsed.reason, "x");
});

test("queueQuerySchema coerces pagination and bounds the limit", () => {
  const parsed = queueQuerySchema.parse({ page: "2", limit: "50" });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 50);
  assert.equal(queueQuerySchema.safeParse({ limit: "500" }).success, false);
});

test("queueQuerySchema only accepts the known queue statuses", () => {
  assert.equal(queueQuerySchema.safeParse({ status: "manual_review" }).success, true);
  assert.equal(queueQuerySchema.safeParse({ status: "sold" }).success, false);
});
