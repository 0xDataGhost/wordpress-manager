/**
 * Store-configuration API client (Phase 30).
 *
 * Calls the backend store-config module (mounted at /api/v1/store-config)
 * through the shared HTTP client, which attaches the Bearer token and unwraps
 * the outer success envelope to the inner `{ data, fetchedAt }` payload. Every
 * GET here wraps its result that way, so each reader returns both `data` and the
 * WordPress `fetchedAt` timestamp for the "last synced" indicator.
 *
 *   Settings   → GET/PUT  /store-config/settings/:group     (view / manage)
 *   Shipping   → GET/…    /store-config/shipping/zones[…]    (view / manage)
 *   Taxes      → GET/…    /store-config/taxes/rates[…]       (view / manage)
 *   Gateways   → GET/PUT  /store-config/gateways[…]          (view / toggle)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — pages render it directly.
 */

import { apiRequest } from "./http";

/** Shape every store-config GET shares: the payload plus the WP sync time. */
export interface Fetched<T> {
  data: T;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Settings groups
// ---------------------------------------------------------------------------

/** Setting groups the backend exposes; each has its own allowlist of keys. */
export const SETTINGS_GROUP_VALUES = ["general", "products", "tax"] as const;

export type SettingsGroup = (typeof SETTINGS_GROUP_VALUES)[number];

/** A WooCommerce setting value as WordPress stores it (strings, mostly). */
export type SettingValue = string | number | boolean;

export interface SettingsGroupData {
  group: SettingsGroup;
  values: Record<string, SettingValue>;
}

export async function getStoreSettings(
  group: SettingsGroup,
): Promise<Fetched<SettingsGroupData>> {
  return apiRequest<Fetched<SettingsGroupData>>(
    `/store-config/settings/${encodeURIComponent(group)}`,
    { method: "GET" },
  );
}

/**
 * Persist a group. Only *changed* allowlisted keys should be sent — the backend
 * rejects unknown keys with a 400 that surfaces as an `ApiError`.
 */
export async function updateStoreSettings(
  group: SettingsGroup,
  values: Record<string, SettingValue>,
): Promise<Fetched<SettingsGroupData>> {
  return apiRequest<Fetched<SettingsGroupData>>(
    `/store-config/settings/${encodeURIComponent(group)}`,
    { method: "PUT", body: { values } },
  );
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export interface ShippingLocation {
  code: string;
  type: string;
}

export interface ShippingMethod {
  instanceId: number;
  methodId: string;
  title: string;
  enabled: boolean;
}

export interface ShippingZone {
  zoneId: number;
  name: string;
  order: number;
  locations: ShippingLocation[];
  methods: ShippingMethod[];
}

/** Method types the backend accepts when adding a method to a zone. */
export const SHIPPING_METHOD_VALUES = [
  "flat_rate",
  "free_shipping",
  "local_pickup",
] as const;

export type ShippingMethodId = (typeof SHIPPING_METHOD_VALUES)[number];

export interface ShippingZoneInput {
  name: string;
  order?: number;
  locations?: ShippingLocation[];
}

export interface ShippingMethodInput {
  methodId: ShippingMethodId;
  title?: string;
  enabled?: boolean;
  settings?: Record<string, SettingValue>;
  instanceId?: number;
}

export async function listShippingZones(): Promise<
  Fetched<{ zones: ShippingZone[] }>
> {
  return apiRequest<Fetched<{ zones: ShippingZone[] }>>(
    "/store-config/shipping/zones",
    { method: "GET" },
  );
}

export async function createShippingZone(
  input: ShippingZoneInput,
): Promise<ShippingZone> {
  return apiRequest<ShippingZone>("/store-config/shipping/zones", {
    method: "POST",
    body: input,
  });
}

export async function updateShippingZone(
  zoneId: number,
  input: ShippingZoneInput,
): Promise<ShippingZone> {
  return apiRequest<ShippingZone>(
    `/store-config/shipping/zones/${encodeURIComponent(zoneId)}`,
    { method: "PUT", body: input },
  );
}

export async function deleteShippingZone(zoneId: number): Promise<void> {
  await apiRequest<unknown>(
    `/store-config/shipping/zones/${encodeURIComponent(zoneId)}`,
    { method: "DELETE" },
  );
}

export async function addShippingMethod(
  zoneId: number,
  input: ShippingMethodInput,
): Promise<ShippingMethod> {
  return apiRequest<ShippingMethod>(
    `/store-config/shipping/zones/${encodeURIComponent(zoneId)}/methods`,
    { method: "POST", body: input },
  );
}

export async function deleteShippingMethod(
  zoneId: number,
  methodId: number | string,
): Promise<void> {
  await apiRequest<unknown>(
    `/store-config/shipping/zones/${encodeURIComponent(
      zoneId,
    )}/methods/${encodeURIComponent(methodId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Tax rates
// ---------------------------------------------------------------------------

export interface TaxRate {
  rateId: number;
  country: string;
  state: string;
  rate: string;
  name: string;
  priority: number;
  compound: boolean;
  shipping: boolean;
  taxClass: string;
}

export interface TaxRateInput {
  country?: string;
  state?: string;
  postcode?: string;
  city?: string;
  rate: string;
  name: string;
  priority?: number;
  compound?: boolean;
  shipping?: boolean;
  taxClass?: string;
}

export async function listTaxRates(): Promise<Fetched<{ rates: TaxRate[] }>> {
  return apiRequest<Fetched<{ rates: TaxRate[] }>>(
    "/store-config/taxes/rates",
    { method: "GET" },
  );
}

export async function createTaxRate(input: TaxRateInput): Promise<TaxRate> {
  return apiRequest<TaxRate>("/store-config/taxes/rates", {
    method: "POST",
    body: input,
  });
}

export async function updateTaxRate(
  rateId: number,
  input: TaxRateInput,
): Promise<TaxRate> {
  return apiRequest<TaxRate>(
    `/store-config/taxes/rates/${encodeURIComponent(rateId)}`,
    { method: "PUT", body: input },
  );
}

export async function deleteTaxRate(rateId: number): Promise<void> {
  await apiRequest<unknown>(
    `/store-config/taxes/rates/${encodeURIComponent(rateId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Payment gateways
// ---------------------------------------------------------------------------

/**
 * A payment gateway as the backend exposes it. Note: the backend NEVER includes
 * secret credentials in this payload — there are no secret fields on this type
 * and none must ever be rendered.
 */
export interface PaymentGateway {
  gatewayId: string;
  title: string;
  description: string;
  enabled: boolean;
  method: string;
  supportsRefunds: boolean;
}

export interface GatewayUpdateInput {
  enabled: boolean;
  title?: string;
  description?: string;
}

export async function listGateways(): Promise<
  Fetched<{ gateways: PaymentGateway[] }>
> {
  return apiRequest<Fetched<{ gateways: PaymentGateway[] }>>(
    "/store-config/gateways",
    { method: "GET" },
  );
}

export async function updateGateway(
  gatewayId: string,
  input: GatewayUpdateInput,
): Promise<PaymentGateway> {
  return apiRequest<PaymentGateway>(
    `/store-config/gateways/${encodeURIComponent(gatewayId)}`,
    { method: "PUT", body: input },
  );
}
