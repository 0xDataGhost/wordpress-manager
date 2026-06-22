/**
 * Products API client for the catalog screens.
 *
 * Each function calls a real backend route from the Phase 5 products module
 * (mounted at /api/v1/products) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listProducts    → GET    /products             (JWT, products.view)
 *   getProduct      → GET    /products/:id         (JWT, products.view)
 *   createProduct   → POST   /products             (JWT, products.create)
 *   updateProduct   → PATCH  /products/:id         (JWT, products.edit)
 *   archiveProduct  → DELETE /products/:id         (JWT, products.delete)
 *   publishProduct  → POST   /products/:id/publish (JWT, products.edit)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 */

import { apiRequest } from "./http";

export type ProductStatus = "draft" | "active" | "archived";

export interface ProductDto {
  id: string;
  storeId: string;
  wpProductId: number | null;
  name: string;
  description: string | null;
  shortDescription: string | null;
  /** Decimal string (exact money), matching the backend numeric column. */
  price: string;
  stockQuantity: number;
  status: ProductStatus;
  imageUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductListResult {
  items: ProductDto[];
  pagination: ProductPagination;
}

export interface ProductListQuery {
  search?: string;
  status?: ProductStatus;
  page?: number;
  limit?: number;
}

export interface ProductInput {
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  price: number;
  stockQuantity: number;
  status: ProductStatus;
  imageUrl?: string | null;
}

export interface PublishResult {
  product: ProductDto;
  connectionStatus: string;
  /** WooCommerce product id returned after a successful publish. */
  wpProductId: number | null;
  dispatched: boolean;
}

/** Thrown for user-facing product failures so the UI can show the message. */
export class ProductError extends Error {}

export async function listProducts(
  query: ProductListQuery = {},
): Promise<ProductListResult> {
  return apiRequest<ProductListResult>("/products", {
    method: "GET",
    query: {
      search: query.search,
      status: query.status,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getProduct(id: string): Promise<ProductDto> {
  return apiRequest<ProductDto>(`/products/${id}`, { method: "GET" });
}

export async function createProduct(input: ProductInput): Promise<ProductDto> {
  return apiRequest<ProductDto>("/products", {
    method: "POST",
    body: input,
  });
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<ProductDto> {
  return apiRequest<ProductDto>(`/products/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export async function archiveProduct(id: string): Promise<ProductDto> {
  return apiRequest<ProductDto>(`/products/${id}`, { method: "DELETE" });
}

export async function publishProduct(id: string): Promise<PublishResult> {
  return apiRequest<PublishResult>(`/products/${id}/publish`, {
    method: "POST",
  });
}
