import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customerParamsSchema,
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
} from "./customers.schemas";

test("listCustomersQuerySchema defaults and coerces pagination", () => {
  const parsed = listCustomersQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);

  const coerced = listCustomersQuerySchema.parse({ page: "3", limit: "50" });
  assert.equal(coerced.page, 3);
  assert.equal(coerced.limit, 50);
});

test("listCustomersQuerySchema caps limit and rejects page below 1", () => {
  assert.equal(
    listCustomersQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.equal(listCustomersQuerySchema.safeParse({ page: "0" }).success, false);
});

test("listCustomersQuerySchema trims and accepts an optional search", () => {
  assert.equal(
    listCustomersQuerySchema.parse({ search: "  سارة  " }).search,
    "سارة",
  );
  assert.equal(listCustomersQuerySchema.parse({}).search, undefined);
});

test("customerParamsSchema accepts a uuid and rejects other strings", () => {
  assert.equal(
    customerParamsSchema.safeParse({
      id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    }).success,
    true,
  );
  assert.equal(customerParamsSchema.safeParse({ id: "99" }).success, false);
});

test("updateCustomerNotesSchema accepts text, null, and trims whitespace", () => {
  assert.equal(
    updateCustomerNotesSchema.parse({ internalNotes: "  عميل VIP  " })
      .internalNotes,
    "عميل VIP",
  );
  assert.equal(
    updateCustomerNotesSchema.parse({ internalNotes: null }).internalNotes,
    null,
  );
  assert.equal(updateCustomerNotesSchema.safeParse({}).success, true);
});

test("updateCustomerNotesSchema rejects notes over the length cap", () => {
  const tooLong = "a".repeat(5001);
  assert.equal(
    updateCustomerNotesSchema.safeParse({ internalNotes: tooLong }).success,
    false,
  );
});
