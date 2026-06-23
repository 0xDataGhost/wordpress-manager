import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../lib/errors";
import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_TYPE_ORDER,
  isAutomationType,
  normalizeConfig,
  parseConfigForType,
} from "./automations.config";

test("AUTOMATION_TYPE_ORDER lists the three Phase 11 automations in order", () => {
  assert.deepEqual(AUTOMATION_TYPE_ORDER, [
    "low_stock_alert",
    "daily_sales_report",
    "whatsapp_order_message",
  ]);
});

test("isAutomationType recognises known types and rejects unknowns", () => {
  assert.equal(isAutomationType("low_stock_alert"), true);
  assert.equal(isAutomationType("whatsapp_order_message"), true);
  assert.equal(isAutomationType("send_email"), false);
});

test("parseConfigForType coerces and validates low_stock_alert threshold", () => {
  const parsed = parseConfigForType("low_stock_alert", { threshold: "7" });
  assert.deepEqual(parsed, { threshold: 7 });
});

test("parseConfigForType rejects a negative low-stock threshold", () => {
  assert.throws(
    () => parseConfigForType("low_stock_alert", { threshold: -1 }),
    ValidationError,
  );
});

test("parseConfigForType rejects an unknown key (strict)", () => {
  assert.throws(
    () => parseConfigForType("low_stock_alert", { threshold: 5, extra: 1 }),
    ValidationError,
  );
});

test("parseConfigForType validates the daily report time format", () => {
  assert.deepEqual(parseConfigForType("daily_sales_report", { time: "09:30" }), {
    time: "09:30",
  });
  assert.throws(
    () => parseConfigForType("daily_sales_report", { time: "25:00" }),
    ValidationError,
  );
  assert.throws(
    () => parseConfigForType("daily_sales_report", { time: "9:5" }),
    ValidationError,
  );
});

test("parseConfigForType requires a non-empty whatsapp template", () => {
  assert.throws(
    () => parseConfigForType("whatsapp_order_message", { message_template: "" }),
    ValidationError,
  );
  const ok = parseConfigForType("whatsapp_order_message", {
    message_template: "مرحباً {{customer_name}}",
  });
  assert.equal(ok.message_template, "مرحباً {{customer_name}}");
});

test("normalizeConfig merges defaults over a partial/empty stored config", () => {
  assert.deepEqual(
    normalizeConfig("low_stock_alert", {}),
    AUTOMATION_DEFAULTS.low_stock_alert,
  );
  // A stored override wins over the default.
  assert.deepEqual(normalizeConfig("low_stock_alert", { threshold: 12 }), {
    threshold: 12,
  });
});

test("normalizeConfig falls back to defaults for an invalid stored config", () => {
  assert.deepEqual(
    normalizeConfig("daily_sales_report", { time: "not-a-time" }),
    AUTOMATION_DEFAULTS.daily_sales_report,
  );
});
