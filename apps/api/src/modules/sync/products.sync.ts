import { eq } from "drizzle-orm";
import { db } from "../../db";
import { productImages } from "../../db/schema/product-images";
import type { ProductStatus } from "../../db/schema/products";
import { applyProductUpsert } from "../products/products.service";
import type { ConnectorProductInput } from "../products/products.schemas";
import type { UpsertResult } from "./customers.sync";
import type { WooProduct } from "./sync.schemas";

/**
 * Maps a raw WooCommerce product status onto our catalog status enum. This is
 * the inverse of the publish mapping in products.serializer (active→publish,
 * archived→private, draft→draft); anything unrecognized falls back to draft.
 */
export function wooStatusToProductStatus(wooStatus: string): ProductStatus {
  switch (wooStatus) {
    case "publish":
      return "active";
    case "private":
      return "archived";
    default:
      return "draft";
  }
}

/** Pure transform: a pulled WooCommerce product to the catalog upsert shape. */
export function toProductUpsertInput(woo: WooProduct): ConnectorProductInput {
  return {
    wpProductId: woo.wpProductId,
    name: woo.name,
    description: woo.description ?? null,
    shortDescription: woo.shortDescription ?? null,
    price: Number(woo.price),
    stockQuantity: woo.stockQuantity,
    status: wooStatusToProductStatus(woo.status),
    // Mirror the first gallery image onto the catalog thumbnail field.
    imageUrl: woo.images[0]?.src ?? null,
  };
}

/**
 * Upserts WooCommerce products into a store's catalog and replaces each
 * product's gallery images. Reuses applyProductUpsert (shared with the connector
 * push path) so products and their external mappings stay idempotent, then
 * rewrites product_images wholesale for the product. Transactional per batch.
 */
export async function upsertProductsFromWoo(
  storeId: string,
  incoming: WooProduct[],
): Promise<UpsertResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const woo of incoming) {
      const outcome = await applyProductUpsert(
        tx,
        storeId,
        toProductUpsertInput(woo),
        now,
      );
      if (outcome.created) created += 1;
      else updated += 1;

      // Replace the gallery wholesale so re-syncs do not accumulate stale images.
      await tx
        .delete(productImages)
        .where(eq(productImages.productId, outcome.id));

      if (woo.images.length > 0) {
        await tx.insert(productImages).values(
          woo.images.map((image, index) => ({
            storeId,
            productId: outcome.id,
            wpImageId: image.wpImageId,
            src: image.src,
            alt: image.alt ?? null,
            position: index,
          })),
        );
      }
    }
  });

  return { total: incoming.length, created, updated };
}
