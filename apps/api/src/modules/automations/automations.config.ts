import { z } from "zod";
import { ValidationError } from "../../lib/errors";
import {
  AUTOMATION_TYPES,
  DIGITAL_AUTOMATION_TYPES,
  type AutomationType,
} from "../../db/schema/automations";
import { ORDER_STATUSES } from "../../db/schema/orders";

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

/**
 * Display/provisioning order of the Phase 23 digital automations. Kept separate
 * from AUTOMATION_TYPE_ORDER so the dashboard can render them under their own
 * "أتمتة المنتجات الرقمية" section while still provisioning every type.
 */
export const DIGITAL_AUTOMATION_TYPE_ORDER: AutomationType[] = [
  ...DIGITAL_AUTOMATION_TYPES,
];

/** Every automation type in provisioning/display order (classic then digital). */
export const ALL_AUTOMATION_TYPE_ORDER: AutomationType[] = [
  ...AUTOMATION_TYPE_ORDER,
  ...DIGITAL_AUTOMATION_TYPE_ORDER,
];

/** True when the value is a valid WooCommerce order status (ORDER_STATUSES). */
function isOrderStatus(value: string): boolean {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** A non-empty list of valid WooCommerce order statuses (no duplicates kept). */
const orderStatusListSchema = z
  .array(z.string().trim().min(1))
  .min(1, "Provide at least one order status")
  .refine((arr) => arr.every(isOrderStatus), {
    message: "statuses must be valid WooCommerce order statuses",
  });

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

/* --------------------- Phase 23 digital automations ----------------------- */
/*
 * Each schema validates the per-type config EXCEPT `enabled`: in this codebase
 * `enabled` is the automation row's column (the operational switch checked by
 * the run helpers), not a config key — so the plan's per-automation `enabled`
 * field maps to that column (same as the Phase 11 automations).
 */

/** Digital Low Stock: alert digital products at/under a per-product or global threshold. */
export const digitalLowStockConfigSchema = z
  .object({
    thresholdMode: z.enum(["product_setting", "global"]).default("product_setting"),
    globalThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine(
    (c) => c.thresholdMode !== "global" || typeof c.globalThreshold === "number",
    {
      message: "globalThreshold is required when thresholdMode is 'global'",
      path: ["globalThreshold"],
    },
  );
export type DigitalLowStockConfig = z.infer<typeof digitalLowStockConfigSchema>;

/** Digital Out Of Stock: alert when a digital product's available pool hits zero. */
export const digitalOutOfStockConfigSchema = z
  .object({
    // Advisory role names surfaced in the notification metadata (notifications
    // are store-scoped, so this does not restrict who can see them).
    notifyRoles: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict();
export type DigitalOutOfStockConfig = z.infer<
  typeof digitalOutOfStockConfigSchema
>;

/** Digital Failed Delivery: alert when a delivery has failed at least N times. */
export const digitalFailedDeliveryConfigSchema = z
  .object({
    maxAttempts: z.coerce.number().int().min(1).max(100),
  })
  .strict();
export type DigitalFailedDeliveryConfig = z.infer<
  typeof digitalFailedDeliveryConfigSchema
>;

/** Digital Replacement Rate: alert when the replacement rate exceeds a ceiling. */
export const digitalReplacementRateConfigSchema = z
  .object({
    windowDays: z.coerce.number().int().min(1).max(365),
    maxReplacementRate: z.coerce.number().min(0).max(1),
  })
  .strict();
export type DigitalReplacementRateConfig = z.infer<
  typeof digitalReplacementRateConfigSchema
>;

/** Auto Assign Codes: reserve/assign codes for paid orders in the given statuses. */
export const autoAssignCodesConfigSchema = z
  .object({
    statuses: orderStatusListSchema,
    allowPartial: z.boolean(),
  })
  .strict();
export type AutoAssignCodesConfig = z.infer<typeof autoAssignCodesConfigSchema>;

/** Auto Deliver Codes: deliver assigned codes for paid orders in the given statuses. */
export const autoDeliverCodesConfigSchema = z
  .object({
    statuses: orderStatusListSchema,
    channel: z.enum(["customer_link", "dashboard"]),
  })
  .strict();
export type AutoDeliverCodesConfig = z.infer<
  typeof autoDeliverCodesConfigSchema
>;

const CONFIG_SCHEMA_BY_TYPE: Record<AutomationType, z.ZodTypeAny> = {
  low_stock_alert: lowStockConfigSchema,
  daily_sales_report: dailyReportConfigSchema,
  whatsapp_order_message: whatsappConfigSchema,
  digital_low_stock_alert: digitalLowStockConfigSchema,
  digital_out_of_stock_alert: digitalOutOfStockConfigSchema,
  digital_failed_delivery_alert: digitalFailedDeliveryConfigSchema,
  digital_replacement_rate_alert: digitalReplacementRateConfigSchema,
  auto_assign_codes_on_paid_order: autoAssignCodesConfigSchema,
  auto_deliver_codes_on_paid_order: autoDeliverCodesConfigSchema,
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
  digital_low_stock_alert: { thresholdMode: "product_setting" },
  digital_out_of_stock_alert: { notifyRoles: [] },
  digital_failed_delivery_alert: { maxAttempts: 1 },
  digital_replacement_rate_alert: { windowDays: 7, maxReplacementRate: 0.05 },
  auto_assign_codes_on_paid_order: {
    statuses: ["processing", "completed"],
    allowPartial: false,
  },
  auto_deliver_codes_on_paid_order: {
    statuses: ["processing", "completed"],
    channel: "customer_link",
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
