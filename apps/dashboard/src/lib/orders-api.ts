/**
 * Orders API client for the orders screens.
 *
 * Each function calls a real backend route from the Phase 7 orders module
 * (mounted at /api/v1/orders) through the shared HTTP client, which attaches the
 * Bearer token and unwraps the response envelope:
 *   listOrders        → GET   /orders               (JWT, orders.view)
 *   getOrder          → GET   /orders/:id           (JWT, orders.view)
 *   updateOrderNotes  → PATCH /orders/:id/notes     (JWT, orders.edit)
 *
 * Phase 27 write-back routes (executed in WordPress via the command outbox):
 *   updateOrderStatus → PUT   /orders/:id/status    (JWT, orders.manage_status)
 *   listOrderWpNotes  → GET   /orders/:id/wp-notes  (JWT, orders.view)
 *   addOrderWpNote    → POST  /orders/:id/wp-notes  (JWT, orders.add_notes)
 *   createOrderRefund → POST  /orders/:id/refunds   (JWT, orders.refund;
 *                       refundPayment=true also needs orders.refund_payment)
 *   listOrderRefunds  → GET   /orders/:id/refunds   (JWT, orders.view)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 * Write-back specifics: 409 = WordPress has a newer version (refresh + retry),
 * 503 = store not connected / delivery to WooCommerce failed.
 */

import { apiRequest } from "./http";

/** Canonical WooCommerce order statuses surfaced in the dashboard filter. */
export type OrderStatus =
  | "pending"
  | "processing"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed";

export interface CustomerSummaryDto {
  id: string;
  wpCustomerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** Decimal string (exact money). */
  totalSpent: string;
  ordersCount: number;
  lastOrderAt: string | null;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string | null;
  wpProductId: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  /** Decimal strings (exact money). */
  price: string;
  total: string;
}

export interface OrderDto {
  id: string;
  storeId: string;
  wpOrderId: number | null;
  customerId: string | null;
  orderNumber: string | null;
  /** Raw WooCommerce status; map with ORDER_STATUS_META for display. */
  status: string;
  /** Decimal string (exact money). */
  total: string;
  /** Decimal string — sum of all refunds mirrored for this order. */
  totalRefunded: string;
  currency: string;
  paymentMethod: string | null;
  internalNotes: string | null;
  placedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummaryDto | null;
}

export interface OrderDetailsDto extends OrderDto {
  items: OrderItemDto[];
}

export interface OrderPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrderListResult {
  items: OrderDto[];
  pagination: OrderPagination;
}

export interface OrderListQuery {
  search?: string;
  status?: OrderStatus;
  /** Inclusive date bounds as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function listOrders(
  query: OrderListQuery = {},
): Promise<OrderListResult> {
  return apiRequest<OrderListResult>("/orders", {
    method: "GET",
    query: {
      search: query.search,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getOrder(id: string): Promise<OrderDetailsDto> {
  return apiRequest<OrderDetailsDto>(`/orders/${id}`, { method: "GET" });
}

export async function updateOrderNotes(
  id: string,
  internalNotes: string | null,
): Promise<OrderDetailsDto> {
  return apiRequest<OrderDetailsDto>(`/orders/${id}/notes`, {
    method: "PATCH",
    body: { internalNotes },
  });
}

/**
 * Change the order status in WooCommerce (Phase 27). Returns the updated order
 * mirror. Throws ApiError: 409 when WordPress has a newer version of the order
 * (refresh and retry), 503 when delivery to WooCommerce failed, 400 when the
 * order is not linked to WooCommerce or already has the requested status.
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<OrderDto> {
  return apiRequest<OrderDto>(`/orders/${id}/status`, {
    method: "PUT",
    body: { status },
  });
}

/** One WooCommerce order note (live read from the store). */
export interface OrderWpNoteDto {
  noteId: number;
  note: string;
  /** True = customer-facing note (WooCommerce may email it); false = private. */
  customerNote: boolean;
  addedBy: string | null;
  dateCreated: string | null;
}

export interface OrderWpNotesResult {
  items: OrderWpNoteDto[];
}

/** Live WooCommerce notes for the order. Throws 503 when the store is offline. */
export async function listOrderWpNotes(
  id: string,
): Promise<OrderWpNotesResult> {
  return apiRequest<OrderWpNotesResult>(`/orders/${id}/wp-notes`, {
    method: "GET",
  });
}

export interface AddOrderWpNoteInput {
  note: string;
  /** True to make the note customer-facing (WooCommerce may email it). */
  customerNote: boolean;
}

export interface AddOrderWpNoteResult {
  noteId: number;
  customerNote: boolean;
}

export async function addOrderWpNote(
  id: string,
  input: AddOrderWpNoteInput,
): Promise<AddOrderWpNoteResult> {
  return apiRequest<AddOrderWpNoteResult>(`/orders/${id}/wp-notes`, {
    method: "POST",
    body: input,
  });
}

/** Mirror row of a WooCommerce refund. `amount` stays a decimal string. */
export interface OrderRefundDto {
  id: string;
  orderId: string;
  wpRefundId: number | null;
  amount: string;
  currency: string;
  reason: string | null;
  /** True when real money moved back through the payment gateway. */
  refundedPayment: boolean;
  initiatedBy: "saas" | "woocommerce";
  createdBy: string | null;
  wpDateCreated: string | null;
  createdAt: string;
}

export interface CreateOrderRefundInput {
  amount: number;
  reason?: string;
  /** Move real money at the gateway — also needs orders.refund_payment. */
  refundPayment: boolean;
  restockItems: boolean;
  /**
   * Stable per-attempt key (a UUID generated once when the refund dialog opens)
   * so a retry of the SAME refund after a timeout/dropped response reuses it
   * and the backend/connector never move money twice (Phase 32 money-safety).
   */
  idempotencyKey?: string;
}

export interface CreateOrderRefundResult {
  refund: OrderRefundDto;
  order: OrderDto;
}

/**
 * Create a WooCommerce refund (Phase 27, money-sensitive). Throws ApiError:
 * 409 when another refund is in flight, 400 when the amount exceeds the
 * remaining refundable amount.
 */
export async function createOrderRefund(
  id: string,
  input: CreateOrderRefundInput,
): Promise<CreateOrderRefundResult> {
  return apiRequest<CreateOrderRefundResult>(`/orders/${id}/refunds`, {
    method: "POST",
    body: input,
  });
}

export interface OrderRefundsResult {
  items: OrderRefundDto[];
}

export async function listOrderRefunds(
  id: string,
): Promise<OrderRefundsResult> {
  return apiRequest<OrderRefundsResult>(`/orders/${id}/refunds`, {
    method: "GET",
  });
}
