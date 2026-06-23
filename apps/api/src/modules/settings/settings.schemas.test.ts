import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SETTINGS_DEFAULTS,
  mergeSettings,
  normalizeSettings,
  settingsSchema,
  updateSettingsSchema,
} from "./settings.schemas";

test("settingsSchema accepts the defaults", () => {
  assert.equal(settingsSchema.safeParse(SETTINGS_DEFAULTS).success, true);
});

test("settingsSchema rejects an invalid hex primary_color", () => {
  const bad = {
    ...SETTINGS_DEFAULTS,
    branding: { logo_url: null, primary_color: "red" },
  };
  assert.equal(settingsSchema.safeParse(bad).success, false);
});

test("settingsSchema rejects an invalid timezone and date range", () => {
  const badTz = {
    ...SETTINGS_DEFAULTS,
    general: { ...SETTINGS_DEFAULTS.general, timezone: "Mars/Phobos" },
  };
  assert.equal(settingsSchema.safeParse(badTz).success, false);

  const badRange = {
    ...SETTINGS_DEFAULTS,
    dashboard: { ...SETTINGS_DEFAULTS.dashboard, default_date_range: "custom" },
  };
  assert.equal(settingsSchema.safeParse(badRange).success, false);
});

test("settingsSchema rejects an out-of-range refresh interval", () => {
  const bad = {
    ...SETTINGS_DEFAULTS,
    dashboard: {
      default_date_range: "30d",
      dashboard_refresh_interval: 99999,
    },
  };
  assert.equal(settingsSchema.safeParse(bad).success, false);
});

test("updateSettingsSchema coerces blank email/url/phone to null", () => {
  const parsed = updateSettingsSchema.parse({
    general: { support_email: "  ", support_phone: "" },
    branding: { logo_url: "" },
  });
  assert.equal(parsed.general?.support_email, null);
  assert.equal(parsed.general?.support_phone, null);
  assert.equal(parsed.branding?.logo_url, null);
});

test("updateSettingsSchema lowercases and validates a support email", () => {
  const parsed = updateSettingsSchema.parse({
    general: { support_email: "Help@Store.COM" },
  });
  assert.equal(parsed.general?.support_email, "help@store.com");
  assert.equal(
    updateSettingsSchema.safeParse({ general: { support_email: "nope" } })
      .success,
    false,
  );
});

test("updateSettingsSchema rejects an empty body and unknown keys", () => {
  assert.equal(updateSettingsSchema.safeParse({}).success, false);
  assert.equal(
    updateSettingsSchema.safeParse({ general: { foo: "bar" } }).success,
    false,
  );
  assert.equal(
    updateSettingsSchema.safeParse({ unknown: {} }).success,
    false,
  );
});

test("updateSettingsSchema rejects non-http(s) logo URLs (XSS hardening)", () => {
  assert.equal(
    updateSettingsSchema.safeParse({
      branding: { logo_url: "javascript:alert(1)" },
    }).success,
    false,
  );
  assert.equal(
    updateSettingsSchema.safeParse({
      branding: { logo_url: "data:text/html,<script>" },
    }).success,
    false,
  );
  const ok = updateSettingsSchema.parse({
    branding: { logo_url: "https://cdn.store.com/logo.png" },
  });
  assert.equal(ok.branding?.logo_url, "https://cdn.store.com/logo.png");
});

test("updateSettingsSchema allows a single partial field", () => {
  const parsed = updateSettingsSchema.parse({
    notifications: { enable_daily_reports: false },
  });
  assert.equal(parsed.notifications?.enable_daily_reports, false);
  assert.equal(parsed.general, undefined);
});

test("mergeSettings overrides only provided fields, keeping the rest", () => {
  const merged = mergeSettings(SETTINGS_DEFAULTS, {
    general: { store_name: "متجري" },
    dashboard: { dashboard_refresh_interval: 60 },
  });
  assert.equal(merged.general.store_name, "متجري");
  // Untouched fields retained.
  assert.equal(merged.general.timezone, SETTINGS_DEFAULTS.general.timezone);
  assert.equal(merged.dashboard.dashboard_refresh_interval, 60);
  assert.equal(
    merged.dashboard.default_date_range,
    SETTINGS_DEFAULTS.dashboard.default_date_range,
  );
});

test("normalizeSettings fills defaults for an empty/partial stored value", () => {
  assert.deepEqual(normalizeSettings({}), SETTINGS_DEFAULTS);
  assert.deepEqual(normalizeSettings(null), SETTINGS_DEFAULTS);

  const partial = normalizeSettings({ branding: { primary_color: "#000000" } });
  assert.equal(partial.branding.primary_color, "#000000");
  assert.equal(partial.branding.logo_url, null);
  assert.equal(
    partial.general.timezone,
    SETTINGS_DEFAULTS.general.timezone,
  );
});
