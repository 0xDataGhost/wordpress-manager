/**
 * Catalog-control API client for the Phase 26 catalog screens.
 *
 * Each function calls a real backend route from the catalog module
 * (mounted at /api/v1/catalog) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listTaxonomyTerms   → GET    /catalog/taxonomies/:taxonomy            (products.view)
 *   createTaxonomyTerm  → POST   /catalog/taxonomies/:taxonomy            (catalog.manage_taxonomies)
 *   updateTaxonomyTerm  → PUT    /catalog/taxonomies/:taxonomy/:id        (catalog.manage_taxonomies)
 *   deleteTaxonomyTerm  → DELETE /catalog/taxonomies/:taxonomy/:id        (catalog.manage_taxonomies)
 *   uploadCatalogMedia  → POST   /catalog/media                          (products.manage_media)
 *   bulkUpdateProducts  → POST   /catalog/products/bulk                  (products.edit)
 *   createVariation     → POST   /catalog/products/:id/variations        (products.edit)
 *   updateVariation     → PUT    /catalog/products/:id/variations/:vId    (products.edit)
 *   deleteVariation     → DELETE /catalog/products/:id/variations/:vId    (products.edit)
 *   deleteProductFromWp → DELETE /catalog/products/:id/wp                (products.delete)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 * A 400 with a "publish this product first" message occurs when acting on an
 * unpublished product; the UI surfaces that message.
 */

import { apiRequest } from "./http";

/** Canonical taxonomy kinds handled by the backend. */
export const TAXONOMY_VALUES = ["categories", "tags", "attributes"] as const;

export type Taxonomy = (typeof TAXONOMY_VALUES)[number];

export interface TaxonomyTermDto {
  id: string;
  kind: string;
  /** WooCommerce term id; null before the term is pushed to the store. */
  wpTermId: number | null;
  name: string;
  slug: string | null;
  description: string | null;
  /** Parent WooCommerce term id (categories only); null for top-level. */
  parentWpId: number | null;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomyPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaxonomyListResult {
  items: TaxonomyTermDto[];
  pagination: TaxonomyPagination;
}

export interface TaxonomyListQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaxonomyTermInput {
  name: string;
  slug?: string;
  description?: string;
  parentWpId?: number | null;
}

export interface MediaUploadInput {
  sourceUrl: string;
  attachToWpProductId?: number;
  asFeatured?: boolean;
  altText?: string;
}

export interface MediaUploadResult {
  wpAttachmentId: number;
  src: string;
  attachedToWpProductId: number | null;
  asFeatured: boolean;
}

export type CatalogProductStatus = "publish" | "private";

export interface BulkProductItemInput {
  wpProductId: number;
  regularPrice?: number;
  stockQuantity?: number;
  status?: CatalogProductStatus;
}

export interface BulkProductResultItem {
  wpProductId: number;
  ok: boolean;
  message: string;
}

export interface BulkProductResult {
  total: number;
  succeeded: number;
  failed: number;
  items: BulkProductResultItem[];
}

export interface VariationInput {
  regularPrice?: number;
  salePrice?: number;
  stockQuantity?: number;
  status?: CatalogProductStatus;
  attributes?: Record<string, string>;
  imageUrl?: string;
}

export interface VariationDto {
  wpVariationId: number;
  regularPrice: string | null;
  salePrice: string | null;
  stockQuantity: number | null;
  status: string;
}

export async function listTaxonomyTerms(
  taxonomy: Taxonomy,
  query: TaxonomyListQuery = {},
): Promise<TaxonomyListResult> {
  return apiRequest<TaxonomyListResult>(
    `/catalog/taxonomies/${encodeURIComponent(taxonomy)}`,
    {
      method: "GET",
      query: {
        search: query.search,
        page: query.page,
        limit: query.limit,
      },
    },
  );
}

export async function createTaxonomyTerm(
  taxonomy: Taxonomy,
  input: TaxonomyTermInput,
): Promise<TaxonomyTermDto> {
  return apiRequest<TaxonomyTermDto>(
    `/catalog/taxonomies/${encodeURIComponent(taxonomy)}`,
    { method: "POST", body: input },
  );
}

export async function updateTaxonomyTerm(
  taxonomy: Taxonomy,
  id: string,
  input: TaxonomyTermInput,
): Promise<TaxonomyTermDto> {
  return apiRequest<TaxonomyTermDto>(
    `/catalog/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}`,
    { method: "PUT", body: input },
  );
}

export async function deleteTaxonomyTerm(
  taxonomy: Taxonomy,
  id: string,
): Promise<void> {
  await apiRequest<null>(
    `/catalog/taxonomies/${encodeURIComponent(taxonomy)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function uploadCatalogMedia(
  input: MediaUploadInput,
): Promise<MediaUploadResult> {
  return apiRequest<MediaUploadResult>("/catalog/media", {
    method: "POST",
    body: input,
  });
}

export async function bulkUpdateProducts(
  items: BulkProductItemInput[],
): Promise<BulkProductResult> {
  return apiRequest<BulkProductResult>("/catalog/products/bulk", {
    method: "POST",
    body: { items },
  });
}

export async function createVariation(
  productId: string,
  input: VariationInput,
): Promise<VariationDto> {
  return apiRequest<VariationDto>(
    `/catalog/products/${encodeURIComponent(productId)}/variations`,
    { method: "POST", body: input },
  );
}

export async function updateVariation(
  productId: string,
  variationId: number,
  input: VariationInput,
): Promise<VariationDto> {
  return apiRequest<VariationDto>(
    `/catalog/products/${encodeURIComponent(productId)}/variations/${variationId}`,
    { method: "PUT", body: input },
  );
}

export async function deleteVariation(
  productId: string,
  variationId: number,
): Promise<void> {
  await apiRequest<null>(
    `/catalog/products/${encodeURIComponent(productId)}/variations/${variationId}`,
    { method: "DELETE" },
  );
}

/** Deletes (or trashes) the linked WooCommerce product; returns the SaaS product. */
export async function deleteProductFromWp(
  productId: string,
  force: boolean,
): Promise<import("./products-api").ProductDto> {
  return apiRequest(`/catalog/products/${encodeURIComponent(productId)}/wp`, {
    method: "DELETE",
    body: { force },
  });
}
