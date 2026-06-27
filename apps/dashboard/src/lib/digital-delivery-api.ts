/**
 * Digital delivery API client (Phases 17–19, surfaced in Phase 20.5).
 *
 * Calls the backend digital-delivery module (mounted at /api/v1/digital-delivery)
 * through the shared HTTP client, which attaches the Bearer token and unwraps the
 * response envelope:
 *   getQueue                → GET   /digital-delivery/queue                       (digital_delivery.view)
 *   getOrderAssignments     → GET   /digital-delivery/orders/:id/assignments      (digital_delivery.view)
 *   assignOrder             → POST  /digital-delivery/orders/:id/assign           (digital_delivery.assign)
 *   manualAssign            → POST  /digital-delivery/orders/:id/manual-assign    (digital_delivery.assign)
 *   deliverOrder            → POST  /digital-delivery/orders/:id/deliver          (digital_delivery.deliver)
 *   retryOrder              → POST  /digital-delivery/orders/:id/retry            (digital_delivery.retry)
 *   getOrderDeliveries      → GET   /digital-delivery/orders/:id/deliveries       (digital_delivery.view)
 *   replaceAssignment       → POST  /digital-delivery/assignments/:id/replace     (digital_delivery.replace)
 *   resendAssignment        → POST  /digital-delivery/assignments/:id/resend      (digital_delivery.resend)
 *   updateAssignmentStatus  → PATCH /digital-delivery/assignments/:id/status      (digital_delivery.refund)
 *   releaseOrder            → POST  /digital-delivery/orders/:id/release          (digital_delivery.retry)
 *
 * SECURITY: no endpoint here returns a raw code. Assignments carry only a masked
 * preview; the full code is reachable only via the dedicated reveal endpoint.
 */

import { apiRequest } from "./http";

/** Derived digital fulfillment state for an order (queue + summary). */
export const DIGITAL_DELIVERY_STATUSES = [
  "pending",
  "partial",
  "reserved",
  "failed",
  "manual_review",
  "completed",
] as const;
export type DigitalDeliveryStatus = (typeof DIGITAL_DELIVERY_STATUSES)[number];

/** Safe delivery channels (dashboard is the default, never leaks raw codes). */
export const DELIVERY_CHANNELS = [
  "dashboard",
  "email",
  "whatsapp",
  "woocommerce_note",
  "manual",
] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueueItem {
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  orderStatus: string;
  digitalDeliveryStatus: string;
  requiredCodes: number;
  assignedCodes: number;
  createdAt: string;
}

export interface QueueResult {
  items: QueueItem[];
  pagination: Pagination;
}

export interface QueueQuery {
  status?: DigitalDeliveryStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface Assignment {
  id: string;
  codeId: string;
  /** Masked preview only (e.g. "ABCD••••WXYZ"); never the full code. */
  codePreview: string | null;
  productId: string;
  productName: string | null;
  orderId: string;
  orderItemId: string | null;
  customerId: string | null;
  assignmentType: string;
  status: string;
  assignedAt: string;
  deliveredAt: string | null;
}

export interface OrderAssignmentsView {
  orderId: string;
  orderNumber: string | null;
  orderStatus: string;
  digitalDeliveryStatus: string;
  requiredCodes: number;
  assignedCodes: number;
  assignments: Assignment[];
}

export interface AssignItem {
  productId: string;
  productName: string | null;
  orderItemId: string | null;
  required: number;
  assigned: number;
  missing: number;
}

export interface AssignResult {
  orderId: string;
  status: string;
  requiredCodes: number;
  assignedCodes: number;
  items: AssignItem[];
}

export interface Delivery {
  id: string;
  orderId: string;
  customerId: string | null;
  status: string;
  channel: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  subject: string | null;
  /** Masked rendering only — never contains raw codes. */
  messagePreview: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAttempt {
  id: string;
  deliveryId: string;
  orderId: string;
  channel: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface OrderDeliveriesView {
  orderId: string;
  deliveries: Delivery[];
  attempts: DeliveryAttempt[];
}

export interface DeliverResult {
  orderId: string;
  delivered: boolean;
  idempotent: boolean;
  channel: string;
  delivery: Delivery | null;
}

export interface ManualAssignInput {
  codeId: string;
  orderItemId?: string;
  productId?: string;
  reason: string;
}

export interface ReplaceInput {
  replacementCodeId?: string;
  reason: string;
  resendNow?: boolean;
}

export type AssignmentStatusTarget = "cancelled" | "refunded" | "failed";

export interface ReleaseInput {
  mode: "cancel" | "refund" | "manual_release";
  reason: string;
}

export async function getQueue(query: QueueQuery = {}): Promise<QueueResult> {
  return apiRequest<QueueResult>("/digital-delivery/queue", {
    method: "GET",
    query: {
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getOrderAssignments(
  orderId: string,
): Promise<OrderAssignmentsView> {
  return apiRequest<OrderAssignmentsView>(
    `/digital-delivery/orders/${orderId}/assignments`,
    { method: "GET" },
  );
}

export async function assignOrder(
  orderId: string,
  body: { allowPartial?: boolean; reason?: string } = {},
): Promise<AssignResult> {
  return apiRequest<AssignResult>(
    `/digital-delivery/orders/${orderId}/assign`,
    { method: "POST", body: { mode: "auto", ...body } },
  );
}

export async function manualAssign(
  orderId: string,
  body: ManualAssignInput,
): Promise<{ orderId: string; assignmentId: string; orderStatus: string }> {
  return apiRequest(`/digital-delivery/orders/${orderId}/manual-assign`, {
    method: "POST",
    body,
  });
}

export async function deliverOrder(
  orderId: string,
  body: { channel?: DeliveryChannel; force?: boolean } = {},
): Promise<DeliverResult> {
  return apiRequest<DeliverResult>(
    `/digital-delivery/orders/${orderId}/deliver`,
    { method: "POST", body },
  );
}

export async function retryOrder(
  orderId: string,
  body: { channel?: DeliveryChannel } = {},
): Promise<DeliverResult> {
  return apiRequest<DeliverResult>(`/digital-delivery/orders/${orderId}/retry`, {
    method: "POST",
    body,
  });
}

export async function getOrderDeliveries(
  orderId: string,
): Promise<OrderDeliveriesView> {
  return apiRequest<OrderDeliveriesView>(
    `/digital-delivery/orders/${orderId}/deliveries`,
    { method: "GET" },
  );
}

export async function replaceAssignment(
  assignmentId: string,
  body: ReplaceInput,
): Promise<{
  orderId: string;
  oldAssignmentId: string;
  newAssignmentId: string;
  wasDelivered: boolean;
  orderStatus: string;
}> {
  return apiRequest(`/digital-delivery/assignments/${assignmentId}/replace`, {
    method: "POST",
    body,
  });
}

export async function resendAssignment(
  assignmentId: string,
  body: { channel?: DeliveryChannel } = {},
): Promise<{
  orderId: string;
  assignmentId: string;
  delivered: boolean;
  channel: string;
  deliveryId: string | null;
}> {
  return apiRequest(`/digital-delivery/assignments/${assignmentId}/resend`, {
    method: "POST",
    body,
  });
}

export async function updateAssignmentStatus(
  assignmentId: string,
  body: { status: AssignmentStatusTarget; reason: string },
): Promise<{
  orderId: string;
  assignmentId: string;
  status: string;
  codeStatus: string | null;
  orderStatus: string;
}> {
  return apiRequest(`/digital-delivery/assignments/${assignmentId}/status`, {
    method: "PATCH",
    body,
  });
}

export async function releaseOrder(
  orderId: string,
  body: ReleaseInput,
): Promise<{
  orderId: string;
  mode: string;
  releasedCount: number;
  refundedCount: number;
  deliveredSkippedCount: number;
  orderStatus: string;
}> {
  return apiRequest(`/digital-delivery/orders/${orderId}/release`, {
    method: "POST",
    body,
  });
}

/* ----------------- Phase 22: customer self-service links ----------------- */

export type CustomerLinkStatus = "active" | "revoked" | "expired" | "exhausted";

export interface CustomerLink {
  id: string;
  expiresAt: string;
  /** null = unlimited reveals within the expiry window. */
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
  status: CustomerLinkStatus;
}

export interface CreatedCustomerLink {
  id: string;
  /** The raw token — returned ONCE; compose/copy the link immediately. */
  token: string;
  /** Full link when PUBLIC_APP_URL is configured server-side, else null. */
  url: string | null;
  expiresAt: string;
  maxUses: number | null;
}

export interface CreateCustomerLinkInput {
  expiresInDays?: number;
  /** null = unlimited; omitted = server default (single-use). */
  maxUses?: number | null;
}

export async function createCustomerLink(
  orderId: string,
  body: CreateCustomerLinkInput = {},
): Promise<CreatedCustomerLink> {
  return apiRequest<CreatedCustomerLink>(
    `/digital-delivery/orders/${orderId}/customer-link`,
    { method: "POST", body },
  );
}

export async function listCustomerLinks(
  orderId: string,
): Promise<{ items: CustomerLink[] }> {
  return apiRequest<{ items: CustomerLink[] }>(
    `/digital-delivery/orders/${orderId}/customer-links`,
    { method: "GET" },
  );
}

export async function revokeCustomerLink(
  id: string,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(
    `/digital-delivery/customer-links/${id}/revoke`,
    { method: "POST" },
  );
}
