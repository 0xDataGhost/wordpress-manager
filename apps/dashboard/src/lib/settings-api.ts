/**
 * Settings API client (Phase 12).
 *
 * Calls the real backend settings module (mounted at /api/v1/settings) through
 * the shared HTTP client, which attaches the Bearer token and unwraps the
 * response envelope:
 *   getSettings    → GET   /settings   (JWT, settings.view)
 *   updateSettings → PATCH /settings   (JWT, settings.edit)
 *
 * Failures surface as `ApiError` from lib/http; the page renders `error.message`.
 */

import { apiRequest } from "./http";

export type SettingsDateRange = "today" | "7d" | "30d" | "this_month";

export interface GeneralSettings {
  store_name: string;
  company_name: string;
  support_email: string | null;
  support_phone: string | null;
  timezone: string;
}

export interface NotificationSettings {
  enable_low_stock_notifications: boolean;
  enable_daily_reports: boolean;
  enable_failed_sync_notifications: boolean;
}

export interface DashboardSettings {
  default_date_range: SettingsDateRange;
  dashboard_refresh_interval: number;
}

export interface BrandingSettings {
  logo_url: string | null;
  primary_color: string;
}

export interface SettingsDto {
  storeId: string;
  general: GeneralSettings;
  notifications: NotificationSettings;
  dashboard: DashboardSettings;
  branding: BrandingSettings;
  updatedAt: string;
}

export interface UpdateSettingsInput {
  general?: Partial<GeneralSettings>;
  notifications?: Partial<NotificationSettings>;
  dashboard?: Partial<DashboardSettings>;
  branding?: Partial<BrandingSettings>;
}

export async function getSettings(): Promise<SettingsDto> {
  return apiRequest<SettingsDto>("/settings", { method: "GET" });
}

export async function updateSettings(
  patch: UpdateSettingsInput,
): Promise<SettingsDto> {
  return apiRequest<SettingsDto>("/settings", { method: "PATCH", body: patch });
}
