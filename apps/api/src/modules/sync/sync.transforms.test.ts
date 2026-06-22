import assert from "node:assert/strict";
import { test } from "node:test";
import {
  wooCustomerSchema,
  wooOrderSchema,
  wooProductSchema,
} from "./sync.schemas";
import {
  toProductUpsertInput,
  wooStatusToProductStatus,
} from "./products.sync";

test("wooProductSchema normalizes money and ids from strings", () => {
  const parsed = wooProductSchema.parse({
    wpProductId: "42",
    name: "قميص",
    price: "199.9",
    stockQuantity: "5",
    status: "publish",
    images: [{ src: "https://cdn.example.com/a.jpg" }],
  });
  assert.equal(parsed.wpProductId, 42);
  assert.equal(parsed.price, "199.90");
  assert.equal(parsed.stockQuantity, 5);
  assert.equal(parsed.images[0]?.wpImageId, null);
});

test("wooProductSchema rejects a non-positive product id", () => {
  assert.throws(() => wooProductSchema.parse({ wpProductId: 0, name: "x" }));
});

test("wooStatusToProductStatus maps Woo statuses to the catalog enum", () => {
  assert.equal(wooStatusToProductStatus("publish"), "active");
  assert.equal(wooStatusToProductStatus("private"), "archived");
  assert.equal(wooStatusToProductStatus("draft"), "draft");
  assert.equal(wooStatusToProductStatus("pending"), "draft");
  assert.equal(wooStatusToProductStatus("anything"), "draft");
});

test("toProductUpsertInput mirrors the first image and maps status", () => {
  const woo = wooProductSchema.parse({
    wpProductId: 7,
    name: "Hat",
    price: 50,
    stockQuantity: 3,
    status: "publish",
    images: [
      { src: "https://cdn.example.com/1.jpg" },
      { src: "https://cdn.example.com/2.jpg" },
    ],
  });
  const input = toProductUpsertInput(woo);
  assert.equal(input.wpProductId, 7);
  assert.equal(input.status, "active");
  assert.equal(input.price, 50);
  assert.equal(input.imageUrl, "https://cdn.example.com/1.jpg");
});

test("wooCustomerSchema parses aggregates and a guest-safe date", () => {
  const parsed = wooCustomerSchema.parse({
    wpCustomerId: 9,
    name: "سارة",
    email: "sara@example.com",
    totalSpent: "1500",
    ordersCount: "4",
    lastOrderAt: "2026-05-01T10:00:00Z",
  });
  assert.equal(parsed.totalSpent, "1500.00");
  assert.equal(parsed.ordersCount, 4);
  assert.ok(parsed.lastOrderAt instanceof Date);
});

test("wooCustomerSchema tolerates a missing last order date", () => {
  const parsed = wooCustomerSchema.parse({ wpCustomerId: 9, name: "x" });
  assert.equal(parsed.lastOrderAt, null);
});

test("wooOrderSchema maps guest customers to null and parses line items", () => {
  const parsed = wooOrderSchema.parse({
    wpOrderId: 1001,
    status: "processing",
    total: "350.5",
    currency: "SAR",
    wpCustomerId: 0,
    lineItems: [
      { wpProductId: 42, name: "قميص", quantity: 2, price: "100", total: "200" },
    ],
  });
  assert.equal(parsed.wpCustomerId, null);
  assert.equal(parsed.total, "350.50");
  assert.equal(parsed.lineItems[0]?.wpProductId, 42);
  assert.equal(parsed.lineItems[0]?.total, "200.00");
});
