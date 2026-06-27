import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../lib/errors";
import {
  ALL_AUTOMATION_TYPE_ORDER,
  AUTOMATION_DEFAULTS,
  DIGITAL_AUTOMATION_TYPE_ORDER,
  isAutomationType,
  normalizeConfig,
  parseConfigForType,
} from "./automations.config";
import { DIGITAL_AUTOMATION_TYPES } from "../../db/schema/automations";

test("the six Phase 23 digital types are recognised, in order, and provisioned last", () => {
  for (const type of DIGITAL_AUTOMATION_TYPES) {
    assert.equal(isAutomationType(type), true);
  }
  assert.deepEqual(DIGITAL_AUTOMATION_TYPE_ORDER, [...DIGITAL_AUTOMATION_TYPES]);
  // Classic first, then the six digital types — and supplier-quality is absent.
  assert.equal(ALL_AUTOMATION_TYPE_ORDER.length, 9);
  assert.deepEqual(
    ALL_AUTOMATION_TYPE_ORDER.slice(-6),
    [...DIGITAL_AUTOMATION_TYPES],
  );
  assert.equal(
    ALL_AUTOMATION_TYPE_ORDER.includes(
      "digital_supplier_quality_alert" as never,
    ),
    false,
  );
});

test("every digital default config is valid against its own schema", () => {
  for (const type of DIGITAL_AUTOMATION_TYPES) {
    // parseConfigForType throws on an invalid config, so this asserts validity.
    assert.doesNotThrow(() =>
      parseConfigForType(type, AUTOMATION_DEFAULTS[type]),
    );
  }
});

/* ------------------------- digital_low_stock_alert ------------------------ */

test("digital_low_stock_alert accepts product_setting without a global threshold", () => {
  assert.deepEqual(
    parseConfigForType("digital_low_stock_alert", {
      thresholdMode: "product_setting",
    }),
    { thresholdMode: "product_setting" },
  );
});

test("digital_low_stock_alert requires globalThreshold when mode is global", () => {
  assert.throws(
    () =>
      parseConfigForType("digital_low_stock_alert", { thresholdMode: "global" }),
    ValidationError,
  );
  assert.deepEqual(
    parseConfigForType("digital_low_stock_alert", {
      thresholdMode: "global",
      globalThreshold: "8",
    }),
    { thresholdMode: "global", globalThreshold: 8 },
  );
});

test("digital_low_stock_alert rejects unknown keys (strict)", () => {
  assert.throws(
    () =>
      parseConfigForType("digital_low_stock_alert", {
        thresholdMode: "product_setting",
        extra: 1,
      }),
    ValidationError,
  );
});

/* ----------------------- digital_out_of_stock_alert ----------------------- */

test("digital_out_of_stock_alert accepts an optional notifyRoles list", () => {
  assert.deepEqual(parseConfigForType("digital_out_of_stock_alert", {}), {});
  assert.deepEqual(
    parseConfigForType("digital_out_of_stock_alert", {
      notifyRoles: ["Owner", "Manager"],
    }),
    { notifyRoles: ["Owner", "Manager"] },
  );
});

/* --------------------- digital_failed_delivery_alert ---------------------- */

test("digital_failed_delivery_alert requires a positive integer maxAttempts", () => {
  assert.deepEqual(
    parseConfigForType("digital_failed_delivery_alert", { maxAttempts: "2" }),
    { maxAttempts: 2 },
  );
  assert.throws(
    () =>
      parseConfigForType("digital_failed_delivery_alert", { maxAttempts: 0 }),
    ValidationError,
  );
});

/* --------------------- digital_replacement_rate_alert --------------------- */

test("digital_replacement_rate_alert validates windowDays and rate bounds", () => {
  assert.deepEqual(
    parseConfigForType("digital_replacement_rate_alert", {
      windowDays: 7,
      maxReplacementRate: 0.05,
    }),
    { windowDays: 7, maxReplacementRate: 0.05 },
  );
  // Rate must be within 0..1.
  assert.throws(
    () =>
      parseConfigForType("digital_replacement_rate_alert", {
        windowDays: 7,
        maxReplacementRate: 1.5,
      }),
    ValidationError,
  );
  // windowDays must be >= 1.
  assert.throws(
    () =>
      parseConfigForType("digital_replacement_rate_alert", {
        windowDays: 0,
        maxReplacementRate: 0.1,
      }),
    ValidationError,
  );
});

/* -------------------- auto_assign_codes_on_paid_order --------------------- */

test("auto_assign_codes_on_paid_order validates statuses + allowPartial", () => {
  assert.deepEqual(
    parseConfigForType("auto_assign_codes_on_paid_order", {
      statuses: ["processing", "completed", "on-hold"],
      allowPartial: true,
    }),
    {
      statuses: ["processing", "completed", "on-hold"],
      allowPartial: true,
    },
  );
  // Unknown order status rejected.
  assert.throws(
    () =>
      parseConfigForType("auto_assign_codes_on_paid_order", {
        statuses: ["paid"],
        allowPartial: false,
      }),
    ValidationError,
  );
  // Empty statuses rejected.
  assert.throws(
    () =>
      parseConfigForType("auto_assign_codes_on_paid_order", {
        statuses: [],
        allowPartial: false,
      }),
    ValidationError,
  );
});

/* -------------------- auto_deliver_codes_on_paid_order -------------------- */

test("auto_deliver_codes_on_paid_order validates statuses + channel enum", () => {
  assert.deepEqual(
    parseConfigForType("auto_deliver_codes_on_paid_order", {
      statuses: ["completed"],
      channel: "customer_link",
    }),
    { statuses: ["completed"], channel: "customer_link" },
  );
  assert.throws(
    () =>
      parseConfigForType("auto_deliver_codes_on_paid_order", {
        statuses: ["completed"],
        channel: "email",
      }),
    ValidationError,
  );
});

/* ------------------------------ normalizeConfig --------------------------- */

test("normalizeConfig merges digital defaults over a partial stored config", () => {
  assert.deepEqual(
    normalizeConfig("auto_deliver_codes_on_paid_order", {
      channel: "dashboard",
    }),
    { statuses: ["processing", "completed"], channel: "dashboard" },
  );
});

test("normalizeConfig falls back to defaults for an invalid stored config", () => {
  assert.deepEqual(
    normalizeConfig("digital_replacement_rate_alert", {
      windowDays: "nope",
      maxReplacementRate: 5,
    }),
    AUTOMATION_DEFAULTS.digital_replacement_rate_alert,
  );
});
