import { z } from "zod";
import { ValidationError } from "../../lib/errors";
import {
  AUTOMATION_TYPES,
  type AutomationType,
} from "../../db/schema/automations";

/**
 * Canonical display order of the Phase 11 automations. Provisioning and the
 * GET /automations list both use this so the dashboard always shows the three
 * automations in the same, intentional order.
 */
export const AUTOMATION_TYPE_ORDER: AutomationType[] = [
  "low_stock_alert",
  "daily_sales_report",
  "whatsapp_order_message",
];

/* ----------------------------- Per-type config ---------------------------- */

/** Low Stock Alert: notify when active products fall to/under `threshold`. */
export const lowStockConfigSchema = z
  .object({
    threshold: z.coerce.number().int().min(0).max(1_000_000),
  })
  .strict();
export type LowStockConfig = z.infer<typeof lowStockConfigSchema>;

/** Daily Sales Report: a `time` (HH:MM, 24h) the report is scheduled for. */
export const dailyReportConfigSchema = z
  .object({
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24-hour)"),
  })
  .strict();
export type DailyReportConfig = z.infer<typeof dailyReportConfigSchema>;

/** WhatsApp Order Message: the `message_template` used to render the message. */
export const whatsappConfigSchema = z
  .object({
    message_template: z.string().trim().min(1).max(2000),
  })
  .strict();
export type WhatsappConfig = z.infer<typeof whatsappConfigSchema>;

const CONFIG_SCHEMA_BY_TYPE: Record<AutomationType, z.ZodTypeAny> = {
  low_stock_alert: lowStockConfigSchema,
  daily_sales_report: dailyReportConfigSchema,
  whatsapp_order_message: whatsappConfigSchema,
};

/**
 * Default config for each automation type. Used when a store's automation rows
 * are lazily provisioned and as the merge base when a partial config update
 * arrives, so stored configs are always complete and valid.
 */
export const AUTOMATION_DEFAULTS: Record<
  AutomationType,
  Record<string, unknown>
> = {
  low_stock_alert: { threshold: 5 },
  daily_sales_report: { time: "09:00" },
  whatsapp_order_message: {
    message_template:
      "مرحباً {{customer_name}}، شكراً لطلبك رقم {{order_number}}. " +
      "إجمالي الطلب {{order_total}}. سنبدأ بتجهيزه قريباً.",
  },
};

/** True when the string is a known Phase 11 automation type. */
export function isAutomationType(value: string): value is AutomationType {
  return (AUTOMATION_TYPES as readonly string[]).includes(value);
}

/**
 * Validates a config object against its type's schema, returning the parsed
 * (coerced) value. Throws a ValidationError so the centralized error handler
 * returns a 400 with field details. Unknown types fall back to passthrough.
 */
export function parseConfigForType(
  type: AutomationType,
  raw: unknown,
): Record<string, unknown> {
  const schema = CONFIG_SCHEMA_BY_TYPE[type];
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      "Invalid automation config",
      result.error.flatten(),
    );
  }
  return result.data as Record<string, unknown>;
}

/**
 * Returns a complete, valid config for a stored row: the type defaults merged
 * with whatever is persisted, then validated. Tolerates partially-populated or
 * legacy rows so reads never fail on a stale config shape.
 */
export function normalizeConfig(
  type: AutomationType,
  stored: unknown,
): Record<string, unknown> {
  const base = AUTOMATION_DEFAULTS[type] ?? {};
  const merged = {
    ...base,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
  const schema = CONFIG_SCHEMA_BY_TYPE[type];
  const result = schema.safeParse(merged);
  return result.success ? (result.data as Record<string, unknown>) : { ...base };
}
