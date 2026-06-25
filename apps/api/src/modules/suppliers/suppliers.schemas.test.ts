import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupplierProductSchema,
  createSupplierSchema,
  updateSupplierProductSchema,
  updateSupplierSchema,
} from "./suppliers.schemas";

const PRODUCT = "11111111-1111-1111-1111-111111111111";

test("createSupplierSchema requires a name and applies defaults", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "A" }).success, false);
  const parsed = createSupplierSchema.parse({ name: "Acme Codes" });
  assert.equal(parsed.status, "active");
  assert.equal(parsed.isPreferred, false);
});

test("createSupplierSchema validates email and coerces blanks to null", () => {
  assert.equal(
    createSupplierSchema.safeParse({ name: "Acme", email: "not-an-email" }).success,
    false,
  );
  const parsed = createSupplierSchema.parse({ name: "Acme", email: "  " });
  assert.equal(parsed.email, null);
});

test("createSupplierSchema rejects unknown keys (strict)", () => {
  assert.equal(
    createSupplierSchema.safeParse({ name: "Acme", secret: true }).success,
    false,
  );
});

test("updateSupplierSchema rejects an empty body and accepts a single field", () => {
  assert.equal(updateSupplierSchema.safeParse({}).success, false);
  assert.equal(updateSupplierSchema.safeParse({ status: "paused" }).success, true);
  assert.equal(updateSupplierSchema.safeParse({ status: "deleted" }).success, false);
});

test("createSupplierProductSchema requires a productId", () => {
  assert.equal(createSupplierProductSchema.safeParse({}).success, false);
  assert.equal(
    createSupplierProductSchema.safeParse({ productId: PRODUCT, costPrice: 2.5 })
      .success,
    true,
  );
  assert.equal(
    createSupplierProductSchema.safeParse({ productId: PRODUCT, costPrice: -1 })
      .success,
    false,
  );
});

test("updateSupplierProductSchema rejects an empty body", () => {
  assert.equal(updateSupplierProductSchema.safeParse({}).success, false);
  assert.equal(
    updateSupplierProductSchema.safeParse({ supplierSku: "SKU-1" }).success,
    true,
  );
});
