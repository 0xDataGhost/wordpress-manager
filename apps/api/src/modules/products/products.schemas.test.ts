import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectorSyncSchema,
  createProductSchema,
  listProductsQuerySchema,
  productParamsSchema,
  updateProductSchema,
} from "./products.schemas";

test("createProductSchema applies defaults for omitted optional fields", () => {
  const parsed = createProductSchema.parse({ name: "Test Product" });
  assert.equal(parsed.name, "Test Product");
  assert.equal(parsed.price, 0);
  assert.equal(parsed.stockQuantity, 0);
  assert.equal(parsed.status, "draft");
});

test("createProductSchema trims the name and rejects too-short values", () => {
  assert.equal(createProductSchema.parse({ name: "  Shirt  " }).name, "Shirt");
  assert.equal(createProductSchema.safeParse({ name: "a" }).success, false);
  assert.equal(createProductSchema.safeParse({ name: "" }).success, false);
});

test("createProductSchema rejects negative price and out-of-range stock", () => {
  assert.equal(
    createProductSchema.safeParse({ name: "Item", price: -1 }).success,
    false,
  );
  assert.equal(
    createProductSchema.safeParse({ name: "Item", stockQuantity: -5 }).success,
    false,
  );
  assert.equal(
    createProductSchema.safeParse({ name: "Item", stockQuantity: 1.5 }).success,
    false,
  );
});

test("createProductSchema rejects an unknown status and a non-url image", () => {
  assert.equal(
    createProductSchema.safeParse({ name: "Item", status: "published" }).success,
    false,
  );
  assert.equal(
    createProductSchema.safeParse({ name: "Item", imageUrl: "not-a-url" })
      .success,
    false,
  );
});

test("updateProductSchema requires at least one field", () => {
  assert.equal(updateProductSchema.safeParse({}).success, false);
  assert.equal(updateProductSchema.safeParse({ status: "active" }).success, true);
});

test("updateProductSchema leaves omitted fields out of the result", () => {
  const parsed = updateProductSchema.parse({ name: "New Name" });
  assert.deepEqual(Object.keys(parsed), ["name"]);
});

test("listProductsQuerySchema coerces and defaults pagination", () => {
  const parsed = listProductsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);

  const coerced = listProductsQuerySchema.parse({ page: "3", limit: "50" });
  assert.equal(coerced.page, 3);
  assert.equal(coerced.limit, 50);
});

test("listProductsQuerySchema caps limit and rejects page below 1", () => {
  assert.equal(
    listProductsQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.equal(listProductsQuerySchema.safeParse({ page: "0" }).success, false);
});

test("productParamsSchema accepts a uuid and rejects other strings", () => {
  assert.equal(
    productParamsSchema.safeParse({
      id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    }).success,
    true,
  );
  assert.equal(productParamsSchema.safeParse({ id: "123" }).success, false);
});

test("connectorSyncSchema requires a non-empty product array with positive wp ids", () => {
  assert.equal(connectorSyncSchema.safeParse({ products: [] }).success, false);

  const ok = connectorSyncSchema.parse({
    products: [{ wpProductId: 42, name: "Synced" }],
  });
  assert.equal(ok.products[0].wpProductId, 42);
  assert.equal(ok.products[0].status, "active");

  assert.equal(
    connectorSyncSchema.safeParse({
      products: [{ wpProductId: 0, name: "Bad" }],
    }).success,
    false,
  );
});
