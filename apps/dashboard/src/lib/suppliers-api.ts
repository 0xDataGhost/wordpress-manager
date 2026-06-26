/**
 * Suppliers API client (read-only slice used by the digital-inventory screens).
 *
 * Calls the backend suppliers module (mounted at /api/v1/suppliers) through the
 * shared HTTP client:
 *   listSuppliers → GET /suppliers  (JWT, digital_suppliers.view)
 *
 * Only the read list is exposed here — it powers the supplier filter/selector and
 * resolves supplier ids to names in the inventory tables. Callers must gate the
 * request on `digital_suppliers.view`; roles without it should skip the fetch.
 */

import { apiRequest } from "./http";

export interface SupplierListItem {
  id: string;
  name: string;
  status: string;
  currency: string | null;
  productsCount: number;
  batchesCount: number;
  lastBatchAt: string | null;
}

export interface SuppliersPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SupplierListResult {
  items: SupplierListItem[];
  pagination: SuppliersPagination;
}

export interface ListSuppliersQuery {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listSuppliers(
  query: ListSuppliersQuery = {},
): Promise<SupplierListResult> {
  return apiRequest<SupplierListResult>("/suppliers", {
    method: "GET",
    query: {
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}
