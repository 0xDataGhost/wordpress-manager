import { z } from "zod";

/**
 * Settings validation, defaults, and merge helpers for the Phase 12 settings
 * module. Settings are stored as a single generic jsonb `data` column; these
 * schemas validate every read/write and fill safe defaults so a stored record
 * is always complete and valid.
 */

/** Date-range presets the dashboard supports (excludes the custom range). */
export const SETTINGS_DATE_RANGES = [
  "today",
  "7d",
  "30d",
  "this_month",
] as const;

/** Coerce blank strings to null so the UI can clear an optional field. */
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

/** True when `tz` is a valid IANA timezone (validated via Intl). */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the URL uses an http(s) scheme. `z.string().url()` alone accepts
 * `javascript:`/`data:` URLs, which would be a stored-XSS vector for any future
 * consumer that renders `logo_url` as a link or image — so we restrict to web URLs.
 */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/* ----------------------------- Category schemas --------------------------- */

const generalBase = z.object({
  store_name: z.string().trim().max(200),
  company_name: z.string().trim().max(200),
  support_email: z.preprocess(
    emptyToNull,
    z.string().trim().toLowerCase().email().max(200).nullable(),
  ),
  support_phone: z.preprocess(
    emptyToNull,
    z.string().trim().max(40).nullable(),
  ),
  timezone: z.string().refine(isValidTimezone, "Invalid timezone"),
});

const notificationsBase = z.object({
  enable_low_stock_notifications: z.boolean(),
  enable_daily_reports: z.boolean(),
  enable_failed_sync_notifications: z.boolean(),
});

const dashboardBase = z.object({
  default_date_range: z.enum(SETTINGS_DATE_RANGES),
  dashboard_refresh_interval: z.number().int().min(0).max(3600),
});

const brandingBase = z.object({
  logo_url: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(isHttpUrl, "logo_url must be an http(s) URL")
      .nullable(),
  ),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color must be a hex color like #1a2b3c"),
});

/** Full, validated settings shape (every field required + valid). */
export const settingsSchema = z
  .object({
    general: generalBase.strict(),
    notifications: notificationsBase.strict(),
    dashboard: dashboardBase.strict(),
    branding: brandingBase.strict(),
  })
  .strict();

export type SettingsData = z.infer<typeof settingsSchema>;

/**
 * Body for PATCH /settings. Every category and every field within it is
 * optional (partial update), but unknown categories/keys are rejected (strict)
 * and at least one category must be present.
 */
export const updateSettingsSchema = z
  .object({
    general: generalBase.partial().strict().optional(),
    notifications: notificationsBase.partial().strict().optional(),
    dashboard: dashboardBase.partial().strict().optional(),
    branding: brandingBase.partial().strict().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one settings category to update",
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/* -------------------------------- Defaults -------------------------------- */

/** Safe defaults for a freshly provisioned settings record. */
export const SETTINGS_DEFAULTS: SettingsData = {
  general: {
    store_name: "",
    company_name: "",
    support_email: null,
    support_phone: null,
    timezone: "Asia/Riyadh",
  },
  notifications: {
    enable_low_stock_notifications: true,
    enable_daily_reports: true,
    enable_failed_sync_notifications: true,
  },
  dashboard: {
    default_date_range: "30d",
    dashboard_refresh_interval: 300,
  },
  branding: {
    logo_url: null,
    primary_color: "#16a34a",
  },
};

/* ------------------------------ Merge helpers ----------------------------- */

/**
 * Deep-merges a (partial) patch over a complete settings object, one category
 * level deep. Only fields present in the patch override the current values.
 */
export function mergeSettings(
  current: SettingsData,
  patch: UpdateSettingsInput,
): SettingsData {
  return {
    general: { ...current.general, ...patch.general },
    notifications: { ...current.notifications, ...patch.notifications },
    dashboard: { ...current.dashboard, ...patch.dashboard },
    branding: { ...current.branding, ...patch.branding },
  };
}

/**
 * Returns a complete, valid settings object for a stored jsonb value: defaults
 * merged with whatever is persisted, then validated. Tolerates partial/legacy
 * records so reads never fail on a stale shape (falls back to defaults).
 */
export function normalizeSettings(stored: unknown): SettingsData {
  const base = stored && typeof stored === "object" ? stored : {};
  const merged = mergeSettings(SETTINGS_DEFAULTS, base as UpdateSettingsInput);
  const result = settingsSchema.safeParse(merged);
  return result.success ? result.data : SETTINGS_DEFAULTS;
}
