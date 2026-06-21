import type { ProductRow, ProductStatus } from "../../db/schema/products";

/** Public API shape of a product. `price` stays a decimal string (exact money). */
export interface ProductDto {
  id: string;
  storeId: string;
  wpProductId: number | null;
  name: string;
  description: string | null;
  shortDescription: string | null;
  price: string;
  stockQuantity: number;
  status: string;
  imageUrl: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    storeId: row.storeId,
    wpProductId: row.wpProductId,
    name: row.name,
    description: row.description,
    shortDescription: row.shortDescription,
    price: row.price,
    stockQuantity: row.stockQuantity,
    status: row.status,
    imageUrl: row.imageUrl,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Maps a SaaS product status onto a WooCommerce REST product status. */
const PRODUCT_STATUS_TO_WOO: Record<ProductStatus, string> = {
  draft: "draft",
  active: "publish",
  archived: "private",
};

export interface WooProductImage {
  src: string;
}

/** Minimal WooCommerce REST `products` payload built from a catalog row. */
export interface WooProductPayload {
  name: string;
  type: "simple";
  regular_price: string;
  description: string;
  short_description: string;
  status: string;
  manage_stock: boolean;
  stock_quantity: number;
  images: WooProductImage[];
}

/**
 * Builds the WooCommerce product payload for a catalog row. Pure and free of
 * I/O so it can be unit-tested and reused by the (later) publish worker.
 */
export function toWooPayload(row: ProductRow): WooProductPayload {
  return {
    name: row.name,
    type: "simple",
    regular_price: row.price,
    description: row.description ?? "",
    short_description: row.shortDescription ?? "",
    status: PRODUCT_STATUS_TO_WOO[row.status as ProductStatus] ?? "draft",
    manage_stock: true,
    stock_quantity: row.stockQuantity,
    images: row.imageUrl ? [{ src: row.imageUrl }] : [],
  };
}
