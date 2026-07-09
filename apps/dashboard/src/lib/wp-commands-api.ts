/**
 * WordPress command outbox API client for the Phase 25 command-center screen.
 *
 * Calls the backend wp-commands module (mounted at /api/v1/wp-commands)
 * through the shared HTTP client, which attaches the Bearer token and unwraps
 * the response envelope:
 *   listWpCommands   → GET  /wp-commands           (JWT, wp_commands.view)
 *   getWpCommandStats → GET  /wp-commands/stats    (JWT, wp_commands.view)
 *   retryWpCommand   → POST /wp-commands/:id/retry (JWT, wp_commands.manage)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the page renders it directly.
 */

import { apiRequest } from "./http";

/** Canonical command statuses — kept in sync with the backend outbox. */
export const WP_COMMAND_STATUS_VALUES = [
  "pending",
  "sending",
  "succeeded",
  "conflict",
  "failed",
  "dead",
] as const;

export type WpCommandStatus = (typeof WP_COMMAND_STATUS_VALUES)[number];

/** Canonical command domains — kept in sync with the backend outbox. */
export const WP_COMMAND_DOMAIN_VALUES = [
  "product",
  "order",
  "coupon",
  "customer",
  "review",
  "settings",
  "shipping",
  "tax",
  "media",
  "taxonomy",
] as const;

export type WpCommandDomain = (typeof WP_COMMAND_DOMAIN_VALUES)[number];

export interface WpCommandDto {
  id: string;
  /** One of WP_COMMAND_DOMAIN_VALUES; map for display on the page. */
  domain: string;
  /** Domain-scoped action name (e.g. "create", "update"). */
  action: string;
  /** WooCommerce entity id the command targets; null before creation. */
  targetWpId: number | null;
  status: WpCommandStatus;
  attempts: number;
  lastError: string | null;
  expectedVersion: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WpCommandPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WpCommandListResult {
  items: WpCommandDto[];
  pagination: WpCommandPagination;
}

export interface WpCommandListQuery {
  status?: string;
  domain?: string;
  page?: number;
  limit?: number;
}

export interface WpCommandStats {
  total: number;
  byStatus: Record<WpCommandStatus, number>;
}

export async function listWpCommands(
  query: WpCommandListQuery = {},
): Promise<WpCommandListResult> {
  return apiRequest<WpCommandListResult>("/wp-commands", {
    method: "GET",
    query: {
      status: query.status,
      domain: query.domain,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getWpCommandStats(): Promise<WpCommandStats> {
  return apiRequest<WpCommandStats>("/wp-commands/stats", { method: "GET" });
}

/** Re-queues a failed|dead command; other statuses are rejected (400). */
export async function retryWpCommand(id: string): Promise<WpCommandDto> {
  return apiRequest<WpCommandDto>(
    `/wp-commands/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}
