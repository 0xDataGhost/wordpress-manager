/**
 * Notifications API client for the notifications center.
 *
 * Each function calls a real backend route from the Phase 10 notifications
 * module (mounted at /api/v1/notifications) through the shared HTTP client,
 * which attaches the Bearer token and unwraps the response envelope:
 *   listNotifications        → GET   /notifications            (JWT, dashboard.view)
 *   markNotificationRead     → PATCH /notifications/:id/read   (JWT, dashboard.view)
 *   markAllNotificationsRead → POST  /notifications/read-all   (JWT, dashboard.view)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 */

import { apiRequest } from "./http";

/** Canonical notification types surfaced in the dashboard. */
export type NotificationType =
  | "new_order"
  | "low_stock"
  | "failed_sync"
  | "failed_automation"
  | "daily_report"
  | "whatsapp_order_message"
  | "digital_inventory"
  | "digital_low_stock"
  | "digital_out_of_stock"
  | "digital_delivery_failed"
  | "digital_replacement_rate";

/** Severity drives the badge tone + card accent. */
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationDto {
  id: string;
  storeId: string;
  /** One of NotificationType; map with resolveNotificationType for display. */
  type: string;
  title: string;
  message: string;
  /** One of NotificationSeverity; map with resolveNotificationSeverity. */
  severity: string;
  isRead: boolean;
  readAt: string | null;
  /** Generic structured payload (order id, product id, counts, …) or null. */
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationListResult {
  items: NotificationDto[];
  /** Store-wide unread total, independent of the active filter. */
  unreadCount: number;
  pagination: NotificationPagination;
}

export type NotificationStatusFilter = "read" | "unread";

export interface NotificationListQuery {
  status?: NotificationStatusFilter;
  page?: number;
  limit?: number;
}

export async function listNotifications(
  query: NotificationListQuery = {},
): Promise<NotificationListResult> {
  return apiRequest<NotificationListResult>("/notifications", {
    method: "GET",
    query: {
      status: query.status,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function markNotificationRead(
  id: string,
): Promise<NotificationDto> {
  return apiRequest<NotificationDto>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  });
}
