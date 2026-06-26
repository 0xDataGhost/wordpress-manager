import type { CodeBatchRow } from "../../db/schema/code-batches";
import type { DigitalCodeRow } from "../../db/schema/digital-codes";

/**
 * Public DTOs for the digital inventory API.
 *
 * SECURITY: these mappers are an explicit allowlist. They NEVER expose the
 * encrypted material (`code_cipher` / `code_iv` / `code_tag`), the HMAC
 * fingerprint (`code_hash`), or any raw code. The full code is only ever
 * returned by the dedicated reveal endpoint, not by any serializer here.
 */

export interface CodeListItemDto {
  id: string;
  productId: string;
  productName: string | null;
  batchId: string | null;
  batchName: string | null;
  supplierId: string | null;
  codePreview: string | null;
  status: string;
  /** Exact-decimal unit cost (operational, not secret), or null. */
  costPrice: string | null;
  currency: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CodeDetailsDto extends CodeListItemDto {
  updatedAt: Date;
}

/** Row joined with its product name + batch name (left joins; may be null). */
export interface CodeRowWithNames {
  code: DigitalCodeRow;
  productName: string | null;
  batchName: string | null;
}

export function toCodeListItemDto(row: CodeRowWithNames): CodeListItemDto {
  return {
    id: row.code.id,
    productId: row.code.productId,
    productName: row.productName,
    batchId: row.code.batchId,
    batchName: row.batchName,
    supplierId: row.code.supplierId,
    codePreview: row.code.codePreview,
    status: row.code.status,
    costPrice: row.code.costPrice,
    currency: row.code.currency,
    expiresAt: row.code.expiresAt,
    createdAt: row.code.createdAt,
  };
}

export function toCodeDetailsDto(row: CodeRowWithNames): CodeDetailsDto {
  return {
    ...toCodeListItemDto(row),
    updatedAt: row.code.updatedAt,
  };
}

export interface BatchDto {
  id: string;
  productId: string;
  productName: string | null;
  supplierId: string | null;
  batchName: string | null;
  source: string;
  status: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  quantityDelivered: number;
  quantityInvalid: number;
  costTotal: string | null;
  costPerCode: string | null;
  currency: string | null;
  expiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toBatchDto(
  batch: CodeBatchRow,
  productName: string | null,
): BatchDto {
  return {
    id: batch.id,
    productId: batch.productId,
    productName,
    supplierId: batch.supplierId,
    batchName: batch.batchName,
    source: batch.source,
    status: batch.status,
    quantityTotal: batch.quantityTotal,
    quantityAvailable: batch.quantityAvailable,
    quantityReserved: batch.quantityReserved,
    quantitySold: batch.quantitySold,
    quantityDelivered: batch.quantityDelivered,
    quantityInvalid: batch.quantityInvalid,
    costTotal: batch.costTotal,
    costPerCode: batch.costPerCode,
    currency: batch.currency,
    expiresAt: batch.expiresAt,
    notes: batch.notes,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}
