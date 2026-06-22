/**
 * Customers API client for the customers screens.
 *
 * Each function calls a real backend route from the Phase 8 customers module
 * (mounted at /api/v1/customers) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listCustomers       → GET   /customers            (JWT, customers.view)
 *   getCustomer         → GET   /customers/:id        (JWT, customers.view)
 *   updateCustomerNotes → PATCH /customers/:id/notes  (JWT, customers.edit)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 */

import { apiRequest } from "./http";

export interface CustomerDto {
  id: string;
  storeId: string;
  wpCustomerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** Decimal string (exact money), from the WooCommerce-synced aggregate. */
  totalSpent: string;
  ordersCount: number;
  lastOrderAt: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Read-only linked order shown on the customer details page. */
export interface CustomerOrderDto {
  id: string;
  wpOrderId: number | null;
  orderNumber: string | null;
  status: string;
  total: string;
  currency: string;
  orderDate: string | null;
  createdAt: string;
}

/** Metrics computed from the customer's locally synced orders. */
export interface CustomerMetricsDto {
  totalOrders: number;
  totalSpent: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface CustomerDetailsDto extends CustomerDto {
  metrics: CustomerMetricsDto;
  recentOrders: CustomerOrderDto[];
}

export interface CustomerPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CustomerListResult {
  items: CustomerDto[];
  pagination: CustomerPagination;
}

export interface CustomerListQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export async function listCustomers(
  query: CustomerListQuery = {},
): Promise<CustomerListResult> {
  return apiRequest<CustomerListResult>("/customers", {
    method: "GET",
    query: {
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getCustomer(id: string): Promise<CustomerDetailsDto> {
  return apiRequest<CustomerDetailsDto>(`/customers/${id}`, { method: "GET" });
}

export async function updateCustomerNotes(
  id: string,
  internalNotes: string | null,
): Promise<CustomerDetailsDto> {
  return apiRequest<CustomerDetailsDto>(`/customers/${id}/notes`, {
    method: "PATCH",
    body: { internalNotes },
  });
}
