import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeReplacementRate,
  hasActiveCustomerLink,
  isLowStock,
  isOrderStatusEligible,
  isOutOfStock,
  isReplacementBreach,
  resolveLowStockThreshold,
  selectLowStockProducts,
  selectOutOfStockProducts,
  type ProductStockRow,
} from "./digital-automations.logic";

const rows: ProductStockRow[] = [
  { productId: "p1", productName: "A", available: 0, threshold: 5 },
  { productId: "p2", productName: "B", available: 3, threshold: 5 },
  { productId: "p3", productName: "C", available: 20, threshold: 5 },
  { productId: "p4", productName: "D", available: 8, threshold: 10 },
];

test("resolveLowStockThreshold uses global only in global mode with a value", () => {
  assert.equal(resolveLowStockThreshold("product_setting", 99, 5), 5);
  assert.equal(resolveLowStockThreshold("global", 12, 5), 12);
  // global mode but no global value → fall back to the product setting.
  assert.equal(resolveLowStockThreshold("global", undefined, 5), 5);
});

test("isLowStock excludes empty pools; isOutOfStock matches only empty", () => {
  assert.equal(isLowStock(0, 5), false); // empty is OUT of stock, not low
  assert.equal(isLowStock(3, 5), true);
  assert.equal(isLowStock(5, 5), true);
  assert.equal(isLowStock(6, 5), false);
  assert.equal(isOutOfStock(0), true);
  assert.equal(isOutOfStock(1), false);
});

test("selectLowStockProducts (product_setting) returns low-but-not-empty, sorted", () => {
  const low = selectLowStockProducts(rows, "product_setting", undefined);
  // p2 (3<=5) and p4 (8<=10); p1 is empty (out, not low), p3 is healthy.
  assert.deepEqual(
    low.map((p) => p.productId),
    ["p2", "p4"],
  );
});

test("selectLowStockProducts (global) applies one threshold to every product", () => {
  const low = selectLowStockProducts(rows, "global", 10);
  // p2 (3<=10) and p4 (8<=10); p3 (20) healthy; p1 empty.
  assert.deepEqual(
    low.map((p) => p.productId).sort(),
    ["p2", "p4"],
  );
  assert.equal(low.every((p) => p.threshold === 10), true);
});

test("selectOutOfStockProducts returns only empty pools", () => {
  assert.deepEqual(
    selectOutOfStockProducts(rows).map((p) => p.productId),
    ["p1"],
  );
});

test("computeReplacementRate and isReplacementBreach", () => {
  assert.equal(computeReplacementRate(0, 0), 0);
  assert.equal(computeReplacementRate(10, 2), 0.2);
  assert.equal(isReplacementBreach(10, 2, 0.05), true);
  assert.equal(isReplacementBreach(10, 0, 0.05), false);
  // No assignments → never a breach (avoids divide-by-zero false positive).
  assert.equal(isReplacementBreach(0, 0, 0), false);
  // Exactly at the ceiling is NOT a breach (strict greater-than).
  assert.equal(isReplacementBreach(100, 5, 0.05), false);
});

test("isOrderStatusEligible matches the configured statuses", () => {
  assert.equal(isOrderStatusEligible("completed", ["processing", "completed"]), true);
  assert.equal(isOrderStatusEligible("pending", ["processing", "completed"]), false);
});

test("hasActiveCustomerLink ignores revoked/expired links", () => {
  const now = new Date("2026-06-27T00:00:00Z");
  const future = new Date("2026-07-01T00:00:00Z");
  const past = new Date("2026-06-20T00:00:00Z");

  assert.equal(hasActiveCustomerLink([], now), false);
  assert.equal(
    hasActiveCustomerLink([{ revokedAt: null, expiresAt: future }], now),
    true,
  );
  assert.equal(
    hasActiveCustomerLink([{ revokedAt: now, expiresAt: future }], now),
    false,
  );
  assert.equal(
    hasActiveCustomerLink([{ revokedAt: null, expiresAt: past }], now),
    false,
  );
});
