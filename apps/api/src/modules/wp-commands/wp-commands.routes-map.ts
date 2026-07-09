import { ValidationError } from "../../lib/errors";
import type { WpCommandDomain } from "../../db/schema/wp-commands";
import type { WpRequestMethod } from "../connections/wp-client";

/**
 * Maps a command's (domain, action) to the connector REST route that executes
 * it. Keeping the route in code — not in the command row — means a retry always
 * executes through the CURRENT route logic, and the outbox stores only the
 * normalized body (plan3 §4.1).
 *
 * Grows one entry per capability, phase by phase. Every entry here must have a
 * matching endpoint in the WordPress connector and a capability slug the
 * connector reports (plan3 §2.4).
 */

export interface CommandRoute {
  method: WpRequestMethod;
  path: string;
}

export interface CommandRouteContext {
  targetWpId: number | null;
  payload: unknown;
}

/** Requires the WooCommerce target id routes like "products/{id}" embed. */
function requireTarget(ctx: CommandRouteContext, what: string): number {
  if (!ctx.targetWpId || !Number.isInteger(ctx.targetWpId) || ctx.targetWpId <= 0) {
    throw new ValidationError(`Command requires a WooCommerce ${what} id`);
  }
  return ctx.targetWpId;
}

/** Reads a required path segment (a positive integer id) from the payload. */
function requireField(ctx: CommandRouteContext, field: string): number {
  const payload =
    ctx.payload && typeof ctx.payload === "object"
      ? (ctx.payload as Record<string, unknown>)
      : {};
  const raw = payload[field];
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError(`Command requires a numeric "${field}"`);
  }
  return num;
}

/** Reads and validates the taxonomy segment (category|tag|attribute). */
function requireTaxonomy(ctx: CommandRouteContext): string {
  const payload =
    ctx.payload && typeof ctx.payload === "object"
      ? (ctx.payload as Record<string, unknown>)
      : {};
  const value = String(payload.taxonomy ?? "");
  if (!["categories", "tags", "attributes"].includes(value)) {
    throw new ValidationError(
      'Command requires "taxonomy" of categories|tags|attributes',
    );
  }
  return value;
}

/** Reads and validates the settings group segment. */
function requireGroup(ctx: CommandRouteContext): string {
  const payload =
    ctx.payload && typeof ctx.payload === "object"
      ? (ctx.payload as Record<string, unknown>)
      : {};
  const value = String(payload.group ?? "");
  if (!["general", "products", "tax"].includes(value)) {
    throw new ValidationError(
      'Command requires "group" of general|products|tax',
    );
  }
  return value;
}

/** Reads a required slug path field (bounded, URL-safe). */
function requireStringField(ctx: CommandRouteContext, field: string): string {
  const payload =
    ctx.payload && typeof ctx.payload === "object"
      ? (ctx.payload as Record<string, unknown>)
      : {};
  const value = String(payload[field] ?? "");
  if (!/^[a-z0-9_-]{1,64}$/i.test(value)) {
    throw new ValidationError(`Command requires a valid "${field}"`);
  }
  return value;
}

type RouteResolver = (ctx: CommandRouteContext) => CommandRoute;

const ROUTES: Record<string, RouteResolver> = {
  // Phase 25 — the two pre-existing write paths, now outbox-routed.
  "product.create": () => ({ method: "POST", path: "products" }),
  "product.update": (ctx) => ({
    method: "PUT",
    path: `products/${requireTarget(ctx, "product")}`,
  }),
  "order.add_digital_note": (ctx) => ({
    method: "POST",
    path: `orders/${requireTarget(ctx, "order")}/digital-note`,
  }),

  // Phase 27 — order management write-back.
  "order.update_status": (ctx) => ({
    method: "PUT",
    path: `orders/${requireTarget(ctx, "order")}/status`,
  }),
  "order.add_note": (ctx) => ({
    method: "POST",
    path: `orders/${requireTarget(ctx, "order")}/notes`,
  }),
  "order.create_refund": (ctx) => ({
    method: "POST",
    path: `orders/${requireTarget(ctx, "order")}/refunds`,
  }),

  // Phase 26 — full catalog control.
  "product.delete": (ctx) => ({
    method: "DELETE",
    path: `products/${requireTarget(ctx, "product")}`,
  }),
  "product.bulk_update": () => ({ method: "POST", path: "products/bulk" }),
  "media.create": () => ({ method: "POST", path: "media" }),
  "product.create_variation": (ctx) => ({
    method: "POST",
    path: `products/${requireTarget(ctx, "product")}/variations`,
  }),
  "product.update_variation": (ctx) => ({
    method: "PUT",
    path: `products/${requireTarget(ctx, "product")}/variations/${requireField(ctx, "variationId")}`,
  }),
  "product.delete_variation": (ctx) => ({
    method: "DELETE",
    path: `products/${requireTarget(ctx, "product")}/variations/${requireField(ctx, "variationId")}`,
  }),
  "taxonomy.create": (ctx) => ({
    method: "POST",
    path: `taxonomies/${requireTaxonomy(ctx)}`,
  }),
  "taxonomy.update": (ctx) => ({
    method: "PUT",
    path: `taxonomies/${requireTaxonomy(ctx)}/${requireField(ctx, "termId")}`,
  }),
  "taxonomy.delete": (ctx) => ({
    method: "DELETE",
    path: `taxonomies/${requireTaxonomy(ctx)}/${requireField(ctx, "termId")}`,
  }),

  // Phase 28 — coupons.
  "coupon.create": () => ({ method: "POST", path: "coupons" }),
  "coupon.update": (ctx) => ({
    method: "PUT",
    path: `coupons/${requireTarget(ctx, "coupon")}`,
  }),
  "coupon.delete": (ctx) => ({
    method: "DELETE",
    path: `coupons/${requireTarget(ctx, "coupon")}`,
  }),

  // Phase 29 — customers & reviews.
  "customer.update": (ctx) => ({
    method: "PUT",
    path: `customers/${requireTarget(ctx, "customer")}`,
  }),
  "review.moderate": (ctx) => ({
    method: "PUT",
    path: `reviews/${requireTarget(ctx, "review")}`,
  }),
  "review.reply": (ctx) => ({
    method: "POST",
    path: `reviews/${requireTarget(ctx, "review")}/reply`,
  }),

  // Phase 30 — store configuration.
  "settings.update": (ctx) => ({
    method: "PUT",
    path: `settings/${requireGroup(ctx)}`,
  }),
  "shipping.create_zone": () => ({ method: "POST", path: "shipping/zones" }),
  "shipping.update_zone": (ctx) => ({
    method: "PUT",
    path: `shipping/zones/${requireField(ctx, "zoneId")}`,
  }),
  "shipping.delete_zone": (ctx) => ({
    method: "DELETE",
    path: `shipping/zones/${requireField(ctx, "zoneId")}`,
  }),
  "shipping.save_method": (ctx) => ({
    method: "POST",
    path: `shipping/zones/${requireField(ctx, "zoneId")}/methods`,
  }),
  "shipping.delete_method": (ctx) => ({
    method: "DELETE",
    path: `shipping/zones/${requireField(ctx, "zoneId")}/methods/${requireField(ctx, "methodId")}`,
  }),
  "tax.create_rate": () => ({ method: "POST", path: "taxes/rates" }),
  "tax.update_rate": (ctx) => ({
    method: "PUT",
    path: `taxes/rates/${requireField(ctx, "rateId")}`,
  }),
  "tax.delete_rate": (ctx) => ({
    method: "DELETE",
    path: `taxes/rates/${requireField(ctx, "rateId")}`,
  }),
  "settings.toggle_gateway": (ctx) => ({
    method: "PUT",
    path: `gateways/${requireStringField(ctx, "gatewayId")}`,
  }),
};

/** Resolves the connector route for a command or throws a ValidationError. */
export function resolveCommandRoute(
  domain: WpCommandDomain,
  action: string,
  ctx: CommandRouteContext,
): CommandRoute {
  const resolver = ROUTES[`${domain}.${action}`];
  if (!resolver) {
    throw new ValidationError(
      `Unsupported WordPress command: ${domain}.${action}`,
    );
  }
  return resolver(ctx);
}

/** Every supported "domain.action" pair (for validation and tests). */
export const SUPPORTED_COMMANDS = Object.keys(ROUTES);
