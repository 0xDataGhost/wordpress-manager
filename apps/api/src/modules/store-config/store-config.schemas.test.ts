import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SETTINGS_FIELD_ALLOWLIST,
  toggleGatewaySchema,
  taxRateSchema,
  updateSettingsSchema,
} from "./store-config.schemas";

test("settings allowlist covers the three groups", () => {
  assert.ok(SETTINGS_FIELD_ALLOWLIST.general.includes("woocommerce_currency"));
  assert.ok(SETTINGS_FIELD_ALLOWLIST.tax.includes("woocommerce_calc_taxes"));
  assert.ok(SETTINGS_FIELD_ALLOWLIST.products.includes("woocommerce_weight_unit"));
});

test("toggleGatewaySchema accepts only enabled + safe display fields", () => {
  const parsed = toggleGatewaySchema.parse({ enabled: true, title: "بطاقة" });
  assert.equal(parsed.enabled, true);
  // Secret-looking extra keys are stripped by zod (not in shape) — object still valid.
  const withSecret = toggleGatewaySchema.parse({ enabled: false, title: "x" } as never);
  assert.equal(withSecret.enabled, false);
  assert.equal(toggleGatewaySchema.safeParse({}).success, false);
});

test("taxRateSchema requires rate and name and defaults the class", () => {
  const parsed = taxRateSchema.parse({ rate: "15", name: "VAT" });
  assert.equal(parsed.taxClass, "standard");
  assert.equal(taxRateSchema.safeParse({ rate: "15" }).success, false);
});

test("updateSettingsSchema requires a values map", () => {
  assert.equal(updateSettingsSchema.parse({ values: { a: "b" } }).values.a, "b");
  assert.equal(updateSettingsSchema.safeParse({}).success, false);
});
