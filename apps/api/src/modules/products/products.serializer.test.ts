import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProductRow } from "../../db/schema/products";
import { toProductDto, toWooPayload } from "./products.serializer";

function makeRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    storeId: "11111111-1111-1111-1111-111111111111",
    wpProductId: null,
    name: "قميص قطني",
    description: "وصف كامل",
    shortDescription: "وصف مختصر",
    price: "199.00",
    stockQuantity: 12,
    status: "active",
    imageUrl: "https://cdn.example.com/shirt.jpg",
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

test("toProductDto maps every column and keeps price as a decimal string", () => {
  const row = makeRow();
  const dto = toProductDto(row);

  assert.equal(dto.id, row.id);
  assert.equal(dto.storeId, row.storeId);
  assert.equal(dto.wpProductId, null);
  assert.equal(dto.name, "قميص قطني");
  assert.equal(dto.price, "199.00");
  assert.equal(typeof dto.price, "string");
  assert.equal(dto.stockQuantity, 12);
  assert.equal(dto.status, "active");
  assert.equal(dto.imageUrl, "https://cdn.example.com/shirt.jpg");
  assert.deepEqual(dto.createdAt, row.createdAt);
});

test("toWooPayload maps an active product to a publishable simple product", () => {
  const payload = toWooPayload(makeRow({ status: "active" }));

  assert.equal(payload.type, "simple");
  assert.equal(payload.status, "publish");
  assert.equal(payload.regular_price, "199.00");
  assert.equal(payload.manage_stock, true);
  assert.equal(payload.stock_quantity, 12);
  assert.deepEqual(payload.images, [
    { src: "https://cdn.example.com/shirt.jpg" },
  ]);
});

test("toWooPayload translates status draft/archived to woo equivalents", () => {
  assert.equal(toWooPayload(makeRow({ status: "draft" })).status, "draft");
  assert.equal(toWooPayload(makeRow({ status: "archived" })).status, "private");
});

test("toWooPayload falls back to draft for an unknown status", () => {
  const payload = toWooPayload(makeRow({ status: "weird" as ProductRow["status"] }));
  assert.equal(payload.status, "draft");
});

test("toWooPayload coalesces null descriptions and omits a missing image", () => {
  const payload = toWooPayload(
    makeRow({ description: null, shortDescription: null, imageUrl: null }),
  );

  assert.equal(payload.description, "");
  assert.equal(payload.short_description, "");
  assert.deepEqual(payload.images, []);
});
