/**
 * Customers API client for the customers screens.
 *
 * Each function calls a real backend route from the Phase 8 customers module
 * (mounted at /api/v1/customers) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listCustomers       → GET   /customers            (JWT, customers.view)
 *   getCustomer         → GET   /customers/:id        (JWT, customers.view)
 *   updateCustomerNotes → PATCH /customers/:id/notes  (JWT, customers.edit)
 *   updateCustomerWp    → PUT   /customers/:id        (JWT, customers.manage)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly. A
 * 409 (WooCommerce has a newer version) and a 400 (guest/unsynced customer)
 * from updateCustomerWp come through the same channel.
 */

import { apiRequest } from "./http";

/**
 * A WooCommerce billing/shipping address. Every field is optional; `country`
 * is an uppercase 2-letter ISO code. Shipping addresses have no email field
 * in WooCommerce, but the shared shape keeps it optional for reuse.
 */
export interface CustomerAddressDto {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

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
  /** WooCommerce billing address; null when the customer has none synced. */
  billing: CustomerAddressDto | null;
  /** WooCommerce shipping address; null when the customer has none synced. */
  shipping: CustomerAddressDto | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for the edit-in-WooCommerce action. Every field is optional, but the
 * backend requires at least one top-level field. `billing`/`shipping` carry
 * only the address keys the dialog touches.
 */
export interface CustomerWpUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  billing?: CustomerAddressDto;
  shipping?: CustomerAddressDto;
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

/**
 * Edit the customer's WooCommerce profile (name, phone, billing/shipping
 * addresses). Returns the refreshed customer. A 409 means WooCommerce holds a
 * newer version; a 400 means the customer is a guest/unsynced — both arrive as
 * `ApiError` so the page can surface `.message`.
 */
export async function updateCustomerWp(
  id: string,
  body: CustomerWpUpdateInput,
): Promise<CustomerDto> {
  return apiRequest<CustomerDto>(`/customers/${id}`, {
    method: "PUT",
    body,
  });
}
