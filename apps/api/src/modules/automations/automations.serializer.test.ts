import assert from "node:assert/strict";
import { test } from "node:test";
import type { AutomationRow } from "../../db/schema/automations";
import type { AutomationLogRow } from "../../db/schema/automation-logs";
import {
  toAutomationDto,
  toAutomationLogDto,
} from "./automations.serializer";

function makeAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    storeId: "11111111-1111-1111-1111-111111111111",
    type: "low_stock_alert",
    enabled: true,
    config: { threshold: 8 },
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

test("toAutomationDto maps columns and normalizes config", () => {
  const dto = toAutomationDto(makeAutomation());
  assert.equal(dto.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(dto.type, "low_stock_alert");
  assert.equal(dto.enabled, true);
  assert.deepEqual(dto.config, { threshold: 8 });
});

test("toAutomationDto fills defaults for a partial stored config", () => {
  const dto = toAutomationDto(makeAutomation({ config: {} }));
  assert.deepEqual(dto.config, { threshold: 5 });
});

test("toAutomationDto passes config through for an unknown type", () => {
  const dto = toAutomationDto(
    makeAutomation({ type: "send_email", config: { foo: "bar" } }),
  );
  assert.deepEqual(dto.config, { foo: "bar" });
});

function makeLog(overrides: Partial<AutomationLogRow> = {}): AutomationLogRow {
  return {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    storeId: "11111111-1111-1111-1111-111111111111",
    automationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    type: "low_stock_alert",
    status: "success",
    message: "تم إنشاء تنبيه",
    metadata: { count: 3 },
    createdAt: new Date("2026-06-02T08:00:00.000Z"),
    ...overrides,
  };
}

test("toAutomationLogDto maps every column", () => {
  const dto = toAutomationLogDto(makeLog());
  assert.equal(dto.status, "success");
  assert.equal(dto.type, "low_stock_alert");
  assert.equal(dto.message, "تم إنشاء تنبيه");
  assert.deepEqual(dto.metadata, { count: 3 });
});

test("toAutomationLogDto normalizes absent message/metadata to null", () => {
  const dto = toAutomationLogDto(makeLog({ message: null, metadata: null }));
  assert.equal(dto.message, null);
  assert.equal(dto.metadata, null);
});
