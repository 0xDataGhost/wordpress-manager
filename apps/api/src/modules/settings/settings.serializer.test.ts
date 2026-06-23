import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoreSettingsRow } from "../../db/schema/settings";
import { SETTINGS_DEFAULTS } from "./settings.schemas";
import { toSettingsDto } from "./settings.serializer";

function makeRow(overrides: Partial<StoreSettingsRow> = {}): StoreSettingsRow {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    storeId: "11111111-1111-1111-1111-111111111111",
    data: SETTINGS_DEFAULTS,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:00:00.000Z"),
    ...overrides,
  };
}

test("toSettingsDto exposes categories + storeId + updatedAt", () => {
  const dto = toSettingsDto(makeRow());
  assert.equal(dto.storeId, "11111111-1111-1111-1111-111111111111");
  assert.deepEqual(dto.general, SETTINGS_DEFAULTS.general);
  assert.deepEqual(dto.notifications, SETTINGS_DEFAULTS.notifications);
  assert.deepEqual(dto.dashboard, SETTINGS_DEFAULTS.dashboard);
  assert.deepEqual(dto.branding, SETTINGS_DEFAULTS.branding);
  assert.deepEqual(dto.updatedAt, new Date("2026-06-02T10:00:00.000Z"));
});

test("toSettingsDto normalizes a partial stored payload to a full object", () => {
  const dto = toSettingsDto(
    makeRow({ data: { general: { store_name: "متجري" } } }),
  );
  assert.equal(dto.general.store_name, "متجري");
  // Missing fields filled from defaults.
  assert.equal(dto.general.timezone, SETTINGS_DEFAULTS.general.timezone);
  assert.equal(
    dto.dashboard.default_date_range,
    SETTINGS_DEFAULTS.dashboard.default_date_range,
  );
});
