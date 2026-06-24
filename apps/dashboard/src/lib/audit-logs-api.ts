/**
 * Audit logs API client for the Phase 13.5 audit-logs screen.
 *
 * Calls the backend audit-logs module (mounted at /api/v1/audit-logs) through
 * the shared HTTP client, which attaches the Bearer token and unwraps the
 * response envelope:
 *   listAuditLogs → GET /audit-logs (JWT, settings.view)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the page renders it directly.
 */

import { apiRequest } from "./http";

/** Acting dashboard user; null for system / connector-driven actions. */
export interface AuditLogUser {
  id: string;
  fullName: string;
  email: string;
}

export interface AuditLogDto {
  id: string;
  storeId: string;
  userId: string | null;
  user: AuditLogUser | null;
  /** One of AUDIT_ACTION_VALUES; map with resolveAuditAction for display. */
  action: string;
  /** One of AUDIT_ENTITY_VALUES; map with resolveAuditEntity for display. */
  entityType: string;
  entityId: string | null;
  message: string;
  /** Non-sensitive structured context (ids, counts, changed fields) or null. */
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogListResult {
  items: AuditLogDto[];
  pagination: AuditLogPagination;
}

export interface AuditLogListQuery {
  action?: string;
  entityType?: string;
  userId?: string;
  /** Inclusive date bounds as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/** Canonical action values — kept in sync with the backend AUDIT_ACTIONS. */
export const AUDIT_ACTION_VALUES = [
  "auth.login",
  "auth.logout",
  "product.created",
  "product.updated",
  "product.archived",
  "order.notes_updated",
  "customer.notes_updated",
  "settings.updated",
  "automation.enabled",
  "automation.disabled",
  "automation.config_updated",
  "connection.changed",
  "sync.started",
  "sync.completed",
  "sync.failed",
  "webhook.processed",
  "webhook.failed",
  "ai.used",
] as const;

/** Canonical entity-type values — kept in sync with backend AUDIT_ENTITY_TYPES. */
export const AUDIT_ENTITY_VALUES = [
  "user",
  "product",
  "order",
  "customer",
  "settings",
  "automation",
  "connection",
  "sync",
  "webhook",
  "ai",
] as const;

export async function listAuditLogs(
  query: AuditLogListQuery = {},
): Promise<AuditLogListResult> {
  return apiRequest<AuditLogListResult>("/audit-logs", {
    method: "GET",
    query: {
      action: query.action,
      entityType: query.entityType,
      userId: query.userId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    },
  });
}
