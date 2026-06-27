import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCustomerLinkSchema,
  customerLinkParamsSchema,
} from "./customer-link.schemas";

test("createCustomerLinkSchema accepts an empty body (all defaults)", () => {
  const parsed = createCustomerLinkSchema.parse({});
  assert.equal(parsed.expiresInDays, undefined);
  assert.equal(parsed.maxUses, undefined);
});

test("createCustomerLinkSchema allows null maxUses (unlimited) and a numeric cap", () => {
  assert.equal(createCustomerLinkSchema.safeParse({ maxUses: null }).success, true);
  assert.equal(createCustomerLinkSchema.safeParse({ maxUses: 5 }).success, true);
  assert.equal(createCustomerLinkSchema.safeParse({ maxUses: 0 }).success, false);
});

test("createCustomerLinkSchema bounds expiresInDays and rejects unknown keys", () => {
  assert.equal(createCustomerLinkSchema.safeParse({ expiresInDays: 7 }).success, true);
  assert.equal(createCustomerLinkSchema.safeParse({ expiresInDays: 0 }).success, false);
  assert.equal(createCustomerLinkSchema.safeParse({ expiresInDays: 9999 }).success, false);
  assert.equal(createCustomerLinkSchema.safeParse({ foo: "bar" }).success, false);
});

test("customerLinkParamsSchema requires a uuid id", () => {
  assert.equal(
    customerLinkParamsSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" }).success,
    true,
  );
  assert.equal(customerLinkParamsSchema.safeParse({ id: "nope" }).success, false);
});
