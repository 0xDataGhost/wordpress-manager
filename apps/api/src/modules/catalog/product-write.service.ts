import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { products, type ProductRow } from "../../db/schema/products";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../../lib/errors";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import type {
  BulkUpdateProductsInput,
  CreateMediaInput,
  VariationInput,
} from "./product-write.schemas";

/**
 * Product write-back beyond simple publish (Phase 26): variations, media
 * sideload, bulk operations and WooCommerce deletion. All mutations flow
 * through the command outbox; local catalog state is refreshed from the
 * connector response or via the ensuing sync/webhook.
 */

async function requireLinkedProduct(
  storeId: string,
  productId: string,
): Promise<ProductRow & { wpProductId: number }> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Product not found");
  }
  if (!row.wpProductId) {
    throw new ValidationError(
      "Publish this product to WooCommerce before managing its variations, media or deletion.",
    );
  }
  return row as ProductRow & { wpProductId: number };
}

function variationPayload(input: VariationInput): Record<string, unknown> {
  return {
    regularPrice:
      input.regularPrice === undefined
        ? undefined
        : input.regularPrice.toFixed(2),
    salePrice:
      input.salePrice === undefined || input.salePrice === null
        ? input.salePrice
        : input.salePrice.toFixed(2),
    stockQuantity: input.stockQuantity,
    status: input.status,
    attributes: input.attributes,
    imageUrl: input.imageUrl,
  };
}

export interface VariationResult {
  wpVariationId: number;
  regularPrice: string | null;
  salePrice: string | null;
  stockQuantity: number | null;
  status: string;
}

function parseVariationResult(data: unknown): VariationResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const wpVariationId = Number(d.wpVariationId);
  if (!Number.isInteger(wpVariationId) || wpVariationId <= 0) return null;
  return {
    wpVariationId,
    regularPrice:
      typeof d.regularPrice === "string" ? d.regularPrice : null,
    salePrice: typeof d.salePrice === "string" ? d.salePrice : null,
    stockQuantity:
      d.stockQuantity === null || d.stockQuantity === undefined
        ? null
        : Number(d.stockQuantity),
    status: typeof d.status === "string" ? d.status : "publish",
  };
}

export async function createVariation(
  storeId: string,
  productId: string,
  input: VariationInput,
  userId: string,
): Promise<VariationResult> {
  const product = await requireLinkedProduct(storeId, productId);
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: "create_variation",
    targetWpId: product.wpProductId,
    payload: variationPayload(input),
    createdBy: userId,
  });
  const result = parseVariationResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the variation but returned an unexpected response.",
    );
  }
  return result;
}

export async function updateVariation(
  storeId: string,
  productId: string,
  wpVariationId: number,
  input: VariationInput,
  userId: string,
): Promise<VariationResult> {
  const product = await requireLinkedProduct(storeId, productId);
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: "update_variation",
    targetWpId: product.wpProductId,
    payload: { ...variationPayload(input), variationId: wpVariationId },
    createdBy: userId,
  });
  const result = parseVariationResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the update but returned an unexpected response.",
    );
  }
  return result;
}

export async function deleteVariation(
  storeId: string,
  productId: string,
  wpVariationId: number,
  userId: string,
): Promise<void> {
  const product = await requireLinkedProduct(storeId, productId);
  await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: "delete_variation",
    targetWpId: product.wpProductId,
    payload: { variationId: wpVariationId },
    createdBy: userId,
  });
}

export interface MediaResult {
  wpAttachmentId: number;
  src: string;
  attachedToWpProductId: number | null;
  asFeatured: boolean;
}

export async function createMedia(
  storeId: string,
  input: CreateMediaInput,
  userId: string,
): Promise<MediaResult> {
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "media",
    action: "create",
    targetWpId: input.attachToWpProductId ?? null,
    payload: {
      sourceUrl: input.sourceUrl,
      attachToWpProductId: input.attachToWpProductId ?? null,
      asFeatured: input.asFeatured,
      altText: input.altText,
    },
    createdBy: userId,
  });
  const data = command.result as Record<string, unknown> | null;
  const wpAttachmentId = Number(data?.wpAttachmentId);
  if (!Number.isInteger(wpAttachmentId) || wpAttachmentId <= 0) {
    throw new ServiceUnavailableError(
      "WooCommerce imported the media but returned an unexpected response.",
    );
  }

  // Reflect a new featured image onto the local product thumbnail immediately.
  if (input.attachToWpProductId && input.asFeatured && typeof data?.src === "string") {
    await db
      .update(products)
      .set({ imageUrl: data.src, updatedAt: new Date() })
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.wpProductId, input.attachToWpProductId),
        ),
      );
  }

  return {
    wpAttachmentId,
    src: typeof data?.src === "string" ? data.src : input.sourceUrl,
    attachedToWpProductId: input.attachToWpProductId ?? null,
    asFeatured: input.asFeatured,
  };
}

export interface BulkItemResult {
  wpProductId: number;
  ok: boolean;
  message: string | null;
}

export interface BulkUpdateResult {
  total: number;
  succeeded: number;
  failed: number;
  items: BulkItemResult[];
}

/**
 * Bulk price/stock/status update as ONE outbox command carrying the whole
 * batch; the connector applies each item and returns per-item results.
 */
export async function bulkUpdateProducts(
  storeId: string,
  input: BulkUpdateProductsInput,
  userId: string,
): Promise<BulkUpdateResult> {
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: "bulk_update",
    payload: {
      items: input.items.map((item) => ({
        wpProductId: item.wpProductId,
        regularPrice:
          item.regularPrice === undefined
            ? undefined
            : item.regularPrice.toFixed(2),
        stockQuantity: item.stockQuantity,
        status: item.status,
      })),
    },
    createdBy: userId,
  });

  const data = command.result as { items?: unknown[] } | null;
  const rawItems = Array.isArray(data?.items) ? data!.items : [];
  const items: BulkItemResult[] = rawItems.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      wpProductId: Number(r.wpProductId) || 0,
      ok: r.ok === true,
      message: typeof r.message === "string" ? r.message : null,
    };
  });
  const succeeded = items.filter((i) => i.ok).length;
  return {
    total: items.length,
    succeeded,
    failed: items.length - succeeded,
    items,
  };
}

export interface DeleteProductResult {
  product: ProductRow;
  forced: boolean;
}

/**
 * Deletes a product in WooCommerce (trash by default). The local row is
 * archived (never hard-deleted) so historical order references survive, using
 * the same soft-delete the dashboard already applies elsewhere.
 */
export async function deleteProductInWp(
  storeId: string,
  productId: string,
  force: boolean,
  userId: string,
): Promise<DeleteProductResult> {
  const product = await requireLinkedProduct(storeId, productId);
  await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: "delete",
    targetWpId: product.wpProductId,
    payload: { force },
    createdBy: userId,
  });

  const [archived] = await db
    .update(products)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
    .returning();
  if (!archived) {
    throw new NotFoundError("Product not found");
  }
  return { product: archived, forced: force };
}
