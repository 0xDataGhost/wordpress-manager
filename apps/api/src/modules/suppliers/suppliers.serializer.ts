import type { SupplierRow } from "../../db/schema/suppliers";
import type { SupplierProductRow } from "../../db/schema/supplier-products";

/** Public supplier DTO (no sensitive data — suppliers hold no secrets). */
export interface SupplierDto {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  currency: string | null;
  notes: string | null;
  status: string;
  isPreferred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toSupplierDto(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    country: row.country,
    currency: row.currency,
    notes: row.notes,
    status: row.status,
    isPreferred: row.isPreferred,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** List item = supplier + lightweight rollups for the table. */
export interface SupplierListItemDto extends SupplierDto {
  productsCount: number;
  batchesCount: number;
  lastBatchAt: Date | null;
}

export interface SupplierProductDto {
  id: string;
  supplierId: string;
  productId: string;
  supplierSku: string | null;
  costPrice: string | null;
  currency: string | null;
  minOrderQuantity: number | null;
  leadTimeDays: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSupplierProductDto(
  row: SupplierProductRow,
): SupplierProductDto {
  return {
    id: row.id,
    supplierId: row.supplierId,
    productId: row.productId,
    supplierSku: row.supplierSku,
    costPrice: row.costPrice,
    currency: row.currency,
    minOrderQuantity: row.minOrderQuantity,
    leadTimeDays: row.leadTimeDays,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Live performance metrics for a supplier (plan2 §20). */
export interface SupplierMetricsDto {
  totalCodes: number;
  available: number;
  sold: number;
  delivered: number;
  invalid: number;
  voided: number;
  refunded: number;
  batchesCount: number;
  productsCount: number;
  /** Exact-decimal estimated purchase cost (sum of code cost_price), or null. */
  estimatedCost: string | null;
  currency: string | null;
  /** invalid / totalCodes, rounded to 4 dp. 0 when no codes. */
  invalidRate: number;
}
