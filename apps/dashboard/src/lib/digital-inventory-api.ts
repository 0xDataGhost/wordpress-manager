/**
 * Digital inventory API client (Phase 16 — Code Inventory & Secure Import).
 *
 * Calls the backend digital-inventory module (mounted at /api/v1/digital-inventory)
 * through the shared HTTP client, which attaches the Bearer token and unwraps the
 * response envelope:
 *   getSummary        → GET   /digital-inventory/summary           (digital_inventory.view)
 *   listCodes         → GET   /digital-inventory/codes             (digital_inventory.view)
 *   getCode           → GET   /digital-inventory/codes/:id         (digital_inventory.view)
 *   importCodes       → POST  /digital-inventory/import            (digital_inventory.import)
 *   revealCode        → POST  /digital-inventory/codes/:id/reveal  (digital_inventory.reveal)
 *   updateCodeStatus  → PATCH /digital-inventory/codes/:id/status  (digital_inventory.edit)
 *   listBatches       → GET   /digital-inventory/batches           (digital_inventory.view)
 *   getBatch          → GET   /digital-inventory/batches/:id        (digital_inventory.view)
 *
 * SECURITY: no endpoint here returns a raw code except `revealCode`, which is
 * audited server-side. The list/details DTOs only ever carry a masked preview.
 */

import { apiRequest } from "./http";

/** Canonical code lifecycle statuses (mirrors the backend DIGITAL_CODE_STATUSES). */
export const DIGITAL_CODE_STATUSES = [
  "available",
  "reserved",
  "sold",
  "delivered",
  "replacement",
  "voided",
  "invalid",
  "refunded",
  "expired",
] as const;
export type DigitalCodeStatus = (typeof DIGITAL_CODE_STATUSES)[number];

/** Statuses an operator may set manually (all destructive → reason required). */
export const MANUAL_STATUS_TARGETS = ["voided", "invalid", "expired"] as const;
export type ManualStatusTarget = (typeof MANUAL_STATUS_TARGETS)[number];

export const CODE_BATCH_STATUSES = [
  "active",
  "paused",
  "consumed",
  "archived",
] as const;
export type CodeBatchStatus = (typeof CODE_BATCH_STATUSES)[number];

export interface LowStockProduct {
  productId: string;
  productName: string | null;
  available: number;
  threshold: number;
}

export interface InventorySummary {
  totalCodes: number;
  available: number;
  reserved: number;
  sold: number;
  delivered: number;
  invalid: number;
  voided: number;
  lowStockProducts: LowStockProduct[];
}

export interface CodeListItem {
  id: string;
  productId: string;
  productName: string | null;
  batchId: string | null;
  batchName: string | null;
  /** Masked preview only (e.g. "ABCD••••WXYZ"); never the full code. */
  codePreview: string | null;
  status: DigitalCodeStatus;
  expiresAt: string | null;
  createdAt: string;
}

export interface CodeDetails extends CodeListItem {
  supplierId: string | null;
  costPrice: string | null;
  currency: string | null;
  updatedAt: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CodeListResult {
  items: CodeListItem[];
  pagination: Pagination;
}

export interface ListCodesQuery {
  productId?: string;
  batchId?: string;
  status?: DigitalCodeStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ImportCodesInput {
  productId: string;
  batchName?: string;
  codesText: string;
  source?: string;
  costPerCode?: number;
  currency?: string;
  expiresAt?: string | null;
  notes?: string;
}

export interface ImportResult {
  batchId: string | null;
  received: number;
  inserted: number;
  duplicatesInFile: number;
  duplicatesExisting: number;
  invalid: number;
}

/** The full plaintext, returned ONCE by the audited reveal endpoint. */
export interface RevealResult {
  id: string;
  code: string;
  revealedAt: string;
}

export interface UpdateCodeStatusInput {
  status: ManualStatusTarget;
  reason: string;
}

export interface Batch {
  id: string;
  productId: string;
  productName: string | null;
  supplierId: string | null;
  batchName: string | null;
  source: string;
  status: CodeBatchStatus;
  quantityTotal: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  quantityDelivered: number;
  quantityInvalid: number;
  costTotal: string | null;
  costPerCode: string | null;
  currency: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetails extends Batch {
  statusBreakdown: Record<string, number>;
}

export interface BatchListResult {
  items: Batch[];
  pagination: Pagination;
}

export interface ListBatchesQuery {
  productId?: string;
  status?: CodeBatchStatus;
  page?: number;
  limit?: number;
}

export async function getSummary(productId?: string): Promise<InventorySummary> {
  return apiRequest<InventorySummary>("/digital-inventory/summary", {
    method: "GET",
    query: { productId },
  });
}

export async function listCodes(
  query: ListCodesQuery = {},
): Promise<CodeListResult> {
  return apiRequest<CodeListResult>("/digital-inventory/codes", {
    method: "GET",
    query: {
      productId: query.productId,
      batchId: query.batchId,
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getCode(id: string): Promise<CodeDetails> {
  return apiRequest<CodeDetails>(`/digital-inventory/codes/${id}`, {
    method: "GET",
  });
}

export async function importCodes(
  input: ImportCodesInput,
): Promise<ImportResult> {
  return apiRequest<ImportResult>("/digital-inventory/import", {
    method: "POST",
    body: input,
  });
}

export async function revealCode(id: string): Promise<RevealResult> {
  return apiRequest<RevealResult>(`/digital-inventory/codes/${id}/reveal`, {
    method: "POST",
  });
}

export async function updateCodeStatus(
  id: string,
  input: UpdateCodeStatusInput,
): Promise<CodeDetails> {
  return apiRequest<CodeDetails>(`/digital-inventory/codes/${id}/status`, {
    method: "PATCH",
    body: input,
  });
}

export async function listBatches(
  query: ListBatchesQuery = {},
): Promise<BatchListResult> {
  return apiRequest<BatchListResult>("/digital-inventory/batches", {
    method: "GET",
    query: {
      productId: query.productId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function getBatch(id: string): Promise<BatchDetails> {
  return apiRequest<BatchDetails>(`/digital-inventory/batches/${id}`, {
    method: "GET",
  });
}
