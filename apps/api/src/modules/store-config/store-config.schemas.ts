import { z } from "zod";

/** Settings groups the dashboard can read/write (field-allowlisted). */
export const SETTINGS_GROUPS = ["general", "products", "tax"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export const settingsGroupParamsSchema = z.object({
  group: z.enum(SETTINGS_GROUPS),
});

/**
 * Per-group writable field allowlists. Unknown fields are rejected here (before
 * they ever reach the connector), enforcing plan3 §2.3: settings writes are
 * field-allowlisted per group.
 */
export const SETTINGS_FIELD_ALLOWLIST: Record<SettingsGroup, string[]> = {
  general: [
    "woocommerce_store_address",
    "woocommerce_store_address_2",
    "woocommerce_store_city",
    "woocommerce_store_postcode",
    "woocommerce_default_country",
    "woocommerce_currency",
    "woocommerce_price_thousand_sep",
    "woocommerce_price_decimal_sep",
    "woocommerce_price_num_decimals",
    "woocommerce_currency_pos",
  ],
  products: [
    "woocommerce_weight_unit",
    "woocommerce_dimension_unit",
    "woocommerce_enable_reviews",
    "woocommerce_manage_stock",
    "woocommerce_notify_low_stock_amount",
    "woocommerce_hide_out_of_stock_items",
  ],
  tax: [
    "woocommerce_calc_taxes",
    "woocommerce_prices_include_tax",
    "woocommerce_tax_based_on",
    "woocommerce_tax_display_shop",
    "woocommerce_tax_display_cart",
  ],
};

/** Body for PUT /store-settings/:group — a map of allowlisted field -> value. */
export const updateSettingsSchema = z.object({
  values: z.record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.boolean()])),
});

// ---- Shipping ----
export const shippingZoneParamsSchema = z.object({
  zoneId: z.coerce.number().int().min(0),
});
export const shippingMethodParamsSchema = z.object({
  zoneId: z.coerce.number().int().min(0),
  methodId: z.coerce.number().int().positive(),
});

export const createShippingZoneSchema = z.object({
  name: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).optional(),
  // WooCommerce location codes (country:XX, state:XX:YY, postcode:...).
  locations: z
    .array(
      z.object({
        code: z.string().trim().max(120),
        type: z.enum(["country", "state", "postcode", "continent"]),
      }),
    )
    .max(200)
    .optional(),
});

export const updateShippingZoneSchema = createShippingZoneSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const saveShippingMethodSchema = z.object({
  methodId: z.enum(["flat_rate", "free_shipping", "local_pickup"]),
  title: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
  // Per-method settings (allowlisted at the connector).
  settings: z.record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  // Present when editing an existing instance.
  instanceId: z.number().int().positive().optional(),
});

// ---- Taxes ----
export const taxRateParamsSchema = z.object({
  rateId: z.coerce.number().int().positive(),
});

export const taxRateSchema = z.object({
  country: z.string().trim().max(2).optional(),
  state: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  rate: z.string().trim().max(20),
  name: z.string().trim().max(200),
  priority: z.number().int().min(1).max(100).optional(),
  compound: z.boolean().optional(),
  shipping: z.boolean().optional(),
  taxClass: z.enum(["standard", "reduced-rate", "zero-rate"]).default("standard"),
});

export const updateTaxRateSchema = taxRateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// ---- Gateways ----
export const gatewayParamsSchema = z.object({
  gatewayId: z.string().trim().regex(/^[a-z0-9_-]{1,64}$/i),
});

/** Only enabled + safe display fields — never secret credentials (plan3 §2.3). */
export const toggleGatewaySchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

export type SettingsGroupParams = z.infer<typeof settingsGroupParamsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateShippingZoneInput = z.infer<typeof createShippingZoneSchema>;
export type UpdateShippingZoneInput = z.infer<typeof updateShippingZoneSchema>;
export type SaveShippingMethodInput = z.infer<typeof saveShippingMethodSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
export type ToggleGatewayInput = z.infer<typeof toggleGatewaySchema>;
export type ShippingZoneParams = z.infer<typeof shippingZoneParamsSchema>;
export type ShippingMethodParams = z.infer<typeof shippingMethodParamsSchema>;
export type TaxRateParams = z.infer<typeof taxRateParamsSchema>;
export type GatewayParams = z.infer<typeof gatewayParamsSchema>;
