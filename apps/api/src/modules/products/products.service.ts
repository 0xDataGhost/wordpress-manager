import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import {
  products,
  type NewProductRow,
  type ProductRow,
} from "../../db/schema/products";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import { getConnectionByStoreId } from "../connections/connections.service";
import { toWooPayload, type WooProductPayload } from "./products.serializer";
import type {
  ConnectorProductInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schemas";

/** Escapes LIKE wildcards so user search text matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface ListProductsResult {
  items: ProductRow[];
  total: number;
  page: number;
  limit: number;
}

/** Lists a store's products with optional search/status filter and pagination. */
export async function listProducts(
  storeId: string,
  query: ListProductsQuery,
): Promise<ListProductsResult> {
  const conditions = [eq(products.storeId, storeId)];
  if (query.status) {
    conditions.push(eq(products.status, query.status));
  }
  if (query.search) {
    conditions.push(ilike(products.name, `%${escapeLike(query.search)}%`));
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(products).where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/** Fetches one product scoped to the store, or null when not found. */
export async function getProductById(
  storeId: string,
  id: string,
): Promise<ProductRow | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.id, id)))
    .limit(1);
  return row ?? null;
}

/** Creates a catalog product owned by the store. */
export async function createProduct(
  storeId: string,
  input: CreateProductInput,
): Promise<ProductRow> {
  const [row] = await db
    .insert(products)
    .values({
      storeId,
      name: input.name,
      description: input.description ?? null,
      shortDescription: input.shortDescription ?? null,
      price: input.price.toFixed(2),
      stockQuantity: input.stockQuantity,
      status: input.status,
      imageUrl: input.imageUrl ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create product");
  }
  return row;
}

/** Applies a partial update to a store-owned product. */
export async function updateProduct(
  storeId: string,
  id: string,
  input: UpdateProductInput,
): Promise<ProductRow> {
  const values: Partial<NewProductRow> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) {
    values.description = input.description ?? null;
  }
  if (input.shortDescription !== undefined) {
    values.shortDescription = input.shortDescription ?? null;
  }
  if (input.price !== undefined) values.price = input.price.toFixed(2);
  if (input.stockQuantity !== undefined) {
    values.stockQuantity = input.stockQuantity;
  }
  if (input.status !== undefined) values.status = input.status;
  if (input.imageUrl !== undefined) values.imageUrl = input.imageUrl ?? null;

  const [row] = await db
    .update(products)
    .set(values)
    .where(and(eq(products.storeId, storeId), eq(products.id, id)))
    .returning();

  if (!row) {
    throw new NotFoundError("Product not found");
  }
  return row;
}

/**
 * Soft-deletes a product by archiving it (status = "archived"). The row is kept
 * so historical references and any WooCommerce mapping survive.
 */
export async function archiveProduct(
  storeId: string,
  id: string,
): Promise<ProductRow> {
  const [row] = await db
    .update(products)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(products.storeId, storeId), eq(products.id, id)))
    .returning();

  if (!row) {
    throw new NotFoundError("Product not found");
  }
  return row;
}

export interface PublishResult {
  product: ProductRow;
  connectionStatus: string;
  wooPayload: WooProductPayload;
}

/**
 * Phase 5 publish foundation: validates tenant ownership and an active
 * WordPress connection, then builds the WooCommerce payload. Actual asynchronous
 * delivery to WooCommerce (the publish_product_to_wp job) lands in a later phase,
 * so nothing is dispatched here and lastSyncedAt is left untouched.
 */
export async function publishProductToWp(
  storeId: string,
  id: string,
): Promise<PublishResult> {
  const product = await getProductById(storeId, id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }

  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected") {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store before publishing.",
    );
  }

  return {
    product,
    connectionStatus: connection.status,
    wooPayload: toWooPayload(product),
  };
}

export interface ConnectorSyncResult {
  total: number;
  created: number;
  updated: number;
}

/**
 * Upserts products pushed from the WordPress connector, keyed by wpProductId
 * within the store. Runs in a transaction so a batch is all-or-nothing.
 */
export async function upsertProductsFromConnector(
  storeId: string,
  incoming: ConnectorProductInput[],
): Promise<ConnectorSyncResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const item of incoming) {
      const [existing] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.wpProductId, item.wpProductId),
          ),
        )
        .limit(1);

      const fields = {
        name: item.name,
        description: item.description ?? null,
        shortDescription: item.shortDescription ?? null,
        price: item.price.toFixed(2),
        stockQuantity: item.stockQuantity,
        status: item.status,
        imageUrl: item.imageUrl ?? null,
        lastSyncedAt: now,
      };

      if (existing) {
        await tx
          .update(products)
          .set({ ...fields, updatedAt: now })
          .where(eq(products.id, existing.id));
        updated += 1;
      } else {
        await tx
          .insert(products)
          .values({ storeId, wpProductId: item.wpProductId, ...fields });
        created += 1;
      }
    }
  });

  return { total: incoming.length, created, updated };
}
