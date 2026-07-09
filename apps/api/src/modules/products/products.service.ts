import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db, type DbTransaction } from "../../db";
import {
  products,
  type NewProductRow,
  type ProductRow,
} from "../../db/schema/products";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { getConnectionByStoreId } from "../connections/connections.service";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import { upsertMapping } from "../sync/external-mappings.service";
import { toWooPayload, type WooProductPayload } from "./products.serializer";
import type {
  ConnectorProductInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schemas";

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
      // id tiebreaker keeps pagination stable when rows share a createdAt
      // (common right after a batch sync), matching the other list modules.
      .orderBy(desc(products.createdAt), desc(products.id))
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
  dispatched: boolean;
  wpProductId: number | null;
}

/** Reads the wpProductId out of the connector's create/update product response. */
function extractWpProductId(data: unknown): number | null {
  if (data && typeof data === "object" && "wpProductId" in data) {
    const value = (data as { wpProductId: unknown }).wpProductId;
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(num) && num > 0) return num;
  }
  return null;
}

/**
 * Phase 6 publish completion: validates tenant ownership and an active
 * WordPress connection, then DELIVERS the product to WooCommerce through the
 * connector (create when unlinked, update when already linked). On success the
 * returned WooCommerce product id is persisted on the catalog row, the external
 * mapping is refreshed, lastSyncedAt is stamped, and dispatched is true.
 *
 * When outbound delivery is not available (CONNECTOR_ENCRYPTION_KEY unset on the
 * server, or the store's key predates outbound support) wp-client throws a clear
 * 503 telling the user how to enable it — we never silently report a fake success.
 */
export async function publishProductToWp(
  storeId: string,
  id: string,
  userId: string | null = null,
): Promise<PublishResult> {
  const product = await getProductById(storeId, id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }

  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store before publishing.",
    );
  }

  const wooPayload = toWooPayload(product);

  // Phase 25: publish flows through the command outbox — recorded before the
  // attempt, idempotent at the connector, echo-suppressed on the webhook side.
  // Update when already linked, create otherwise.
  const isUpdate = product.wpProductId !== null;
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "product",
    action: isUpdate ? "update" : "create",
    targetWpId: product.wpProductId,
    payload: wooPayload,
    createdBy: userId,
  });

  const wpProductId =
    extractWpProductId(command.result) ?? product.wpProductId;
  if (!wpProductId) {
    throw new ServiceUnavailableError(
      "WooCommerce did not return a product id for the published product.",
    );
  }

  const updated = await attachWpProductId(storeId, id, wpProductId);

  return {
    product: updated,
    connectionStatus: connection.status,
    wooPayload,
    dispatched: true,
    wpProductId,
  };
}

export interface ConnectorSyncResult {
  total: number;
  created: number;
  updated: number;
}

export interface ProductUpsertOutcome {
  id: string;
  created: boolean;
}

/**
 * Upserts a single product keyed by wpProductId within the store and refreshes
 * its external mapping, all inside the caller's transaction. Shared by the
 * connector push (`/wp/products/sync`) and the dashboard pull sync so both paths
 * stay idempotent and write identical mappings. Returns the local row id and
 * whether it was newly created.
 */
export async function applyProductUpsert(
  tx: DbTransaction,
  storeId: string,
  item: ConnectorProductInput,
  now: Date = new Date(),
  wpVersion: string | null = null,
): Promise<ProductUpsertOutcome> {
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
    // Compare-and-set token; older connectors do not report one — keep the
    // last-known value rather than clearing it.
    ...(wpVersion ? { wpVersion } : {}),
  };

  let id: string;
  let created: boolean;
  if (existing) {
    await tx
      .update(products)
      .set({ ...fields, updatedAt: now })
      .where(eq(products.id, existing.id));
    id = existing.id;
    created = false;
  } else {
    const [inserted] = await tx
      .insert(products)
      .values({ storeId, wpProductId: item.wpProductId, ...fields })
      .returning({ id: products.id });
    if (!inserted) {
      throw new Error("Failed to insert synced product");
    }
    id = inserted.id;
    created = true;
  }

  await upsertMapping(
    tx,
    {
      storeId,
      entityType: "product",
      source: "woocommerce",
      externalId: String(item.wpProductId),
    },
    id,
  );

  return { id, created };
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
      const outcome = await applyProductUpsert(tx, storeId, item, now);
      if (outcome.created) created += 1;
      else updated += 1;
    }
  });

  return { total: incoming.length, created, updated };
}

/** Persists the wpProductId returned by WooCommerce after a successful publish. */
export async function attachWpProductId(
  storeId: string,
  productId: string,
  wpProductId: number,
): Promise<ProductRow> {
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ wpProductId, lastSyncedAt: now, updatedAt: now })
      .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
      .returning();
    if (!updated) {
      throw new NotFoundError("Product not found");
    }
    await upsertMapping(
      tx,
      {
        storeId,
        entityType: "product",
        source: "woocommerce",
        externalId: String(wpProductId),
      },
      productId,
    );
    return updated;
  });
  return row;
}
