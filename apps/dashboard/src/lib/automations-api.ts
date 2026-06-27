/**
 * Automations API client (Phase 11).
 *
 * Each function calls a real backend route from the automations module
 * (mounted at /api/v1/automations) through the shared HTTP client, which
 * attaches the Bearer token and unwraps the response envelope:
 *   listAutomations    → GET   /automations            (JWT, automations.view)
 *   updateAutomation   → PATCH /automations/:id         (JWT, automations.edit)
 *   listAutomationLogs → GET   /automations/:id/logs    (JWT, automations.view)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the page renders `error.message` directly.
 */

import { apiRequest } from "./http";

/** The Phase 11 (classic) automations. */
export type ClassicAutomationType =
  | "low_stock_alert"
  | "daily_sales_report"
  | "whatsapp_order_message";

/** The Phase 23 digital-product automations. */
export type DigitalAutomationType =
  | "digital_low_stock_alert"
  | "digital_out_of_stock_alert"
  | "digital_failed_delivery_alert"
  | "digital_replacement_rate_alert"
  | "auto_assign_codes_on_paid_order"
  | "auto_deliver_codes_on_paid_order";

/** Every automation type surfaced on the /automations page. */
export type AutomationType = ClassicAutomationType | DigitalAutomationType;

/** Outcome of an automation run. */
export type AutomationLogStatus = "success" | "skipped" | "queued" | "failed";

/** Generic config bag; read fields by the automation's type. */
export type AutomationConfig = Record<string, unknown>;

export interface AutomationDto {
  id: string;
  storeId: string;
  /** One of AutomationType (free text; map with the display helpers). */
  type: string;
  enabled: boolean;
  config: AutomationConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogDto {
  id: string;
  storeId: string;
  automationId: string;
  type: string;
  /** One of AutomationLogStatus. */
  status: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AutomationLogsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AutomationLogsResult {
  automation: AutomationDto;
  items: AutomationLogDto[];
  pagination: AutomationLogsPagination;
}

export interface UpdateAutomationInput {
  enabled?: boolean;
  config?: AutomationConfig;
}

export async function listAutomations(): Promise<AutomationDto[]> {
  const data = await apiRequest<{ items: AutomationDto[] }>("/automations", {
    method: "GET",
  });
  return data.items;
}

export async function updateAutomation(
  id: string,
  input: UpdateAutomationInput,
): Promise<AutomationDto> {
  return apiRequest<AutomationDto>(`/automations/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export async function listAutomationLogs(
  id: string,
  query: { page?: number; limit?: number } = {},
): Promise<AutomationLogsResult> {
  return apiRequest<AutomationLogsResult>(`/automations/${id}/logs`, {
    method: "GET",
    query: { page: query.page, limit: query.limit },
  });
}
