import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeAny } from "zod";
import { db } from "../../db";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  AppError,
  ConflictError,
  ServiceUnavailableError,
} from "../../lib/errors";
import {
  syncJobs,
  type SyncJobRow,
  type SyncTrigger,
} from "../../db/schema/sync-jobs";
import type { StoreConnectionRow } from "../../db/schema/store-connections";
import {
  getConnectionByStoreId,
  touchLastSync,
} from "../connections/connections.service";
import { wpRequest } from "../connections/wp-client";
import { upsertCustomersFromWoo, type UpsertResult } from "./customers.sync";
import { upsertOrdersFromWoo } from "./orders.sync";
import { upsertProductsFromWoo } from "./products.sync";
import {
  wooCustomerSchema,
  wooOrderSchema,
  wooPageSchema,
  wooProductSchema,
} from "./sync.schemas";

/** Single (non-"all") entities a sync can target. */
export type SyncEntity = "product" | "order" | "customer";

interface EntityConfig {
  /** Connector read route under /wp-json/saas/v1. */
  route: string;
  itemSchema: ZodTypeAny;
  // `never[]` erases the per-entity item type so the specific upsert functions
  // slot in here without casts (their concrete item arrays are valid targets).
  upsert: (storeId: string, items: never[]) => Promise<UpsertResult>;
}

// Each entity knows its connector route, validation schema and upsert function.
const ENTITY_CONFIG: Record<SyncEntity, EntityConfig> = {
  product: {
    route: "sync/products",
    itemSchema: wooProductSchema,
    upsert: upsertProductsFromWoo,
  },
  customer: {
    route: "sync/customers",
    itemSchema: wooCustomerSchema,
    upsert: upsertCustomersFromWoo,
  },
  order: {
    route: "sync/orders",
    itemSchema: wooOrderSchema,
    upsert: upsertOrdersFromWoo,
  },
};

/**
 * Verifies a store is ready to sync (connected, has a site URL) and returns its
 * connection. Throws a user-facing 503 otherwise. Outbound key/encryption
 * problems are surfaced lazily by wp-client with their own precise messages.
 */
async function requireSyncableConnection(
  storeId: string,
): Promise<StoreConnectionRow> {
  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store before syncing.",
    );
  }
  return connection;
}

/**
 * Pulls one entity from the connector page by page and upserts each page in its
 * own transaction (bounded memory, idempotent). Returns the aggregate counts.
 */
async function pullEntity(
  connection: StoreConnectionRow,
  storeId: string,
  config: EntityConfig,
): Promise<UpsertResult> {
  const pageSchema = wooPageSchema(config.itemSchema);
  let page = 1;
  let totalPages = 1;
  const totals: UpsertResult = { total: 0, created: 0, updated: 0 };

  while (page <= totalPages && page <= env.SYNC_MAX_PAGES) {
    const result = await wpRequest(
      connection,
      "GET",
      `${config.route}?page=${page}&per_page=${env.SYNC_PAGE_SIZE}`,
    );
    if (!result.ok) {
      throw new ServiceUnavailableError(
        `Failed to fetch ${config.route} from WordPress: ${result.message}`,
      );
    }

    const pageData = pageSchema.parse(result.data);
    totalPages = pageData.totalPages || 1;

    if (pageData.items.length > 0) {
      const upserted = await config.upsert(storeId, pageData.items as never[]);
      totals.total += upserted.total;
      totals.created += upserted.created;
      totals.updated += upserted.updated;
    }

    if (pageData.items.length === 0) break;
    page += 1;
  }

  return totals;
}

/**
 * Rejects a new sync when one is already running for the store. Prevents a
 * second trigger (e.g. dashboard + WordPress button at once) from doubling the
 * load on the WordPress site and racing on the same rows. Small TOCTOU window is
 * acceptable: the unique indexes still prevent any duplicate rows, so the worst
 * case is one extra run, never corrupted data.
 */
async function assertNoRunningSync(storeId: string): Promise<void> {
  const [running] = await db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(and(eq(syncJobs.storeId, storeId), eq(syncJobs.status, "running")))
    .limit(1);
  if (running) {
    throw new ConflictError(
      "A sync is already running for this store. Please wait for it to finish.",
    );
  }
}

/** Inserts a sync_jobs row in the "running" state and returns it. */
async function startJob(
  storeId: string,
  entityType: "product" | "order" | "customer" | "all",
  trigger: SyncTrigger,
): Promise<SyncJobRow> {
  const now = new Date();
  const [row] = await db
    .insert(syncJobs)
    .values({ storeId, entityType, trigger, status: "running", startedAt: now })
    .returning();
  if (!row) {
    throw new Error("Failed to create sync job");
  }
  return row;
}

/** Marks a sync job completed with the final counts. */
async function completeJob(
  jobId: string,
  totals: UpsertResult,
): Promise<SyncJobRow> {
  const now = new Date();
  const [row] = await db
    .update(syncJobs)
    .set({
      status: "completed",
      total: totals.total,
      createdCount: totals.created,
      updatedCount: totals.updated,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(syncJobs.id, jobId))
    .returning();
  if (!row) {
    throw new Error("Failed to finalize sync job");
  }
  return row;
}

/** Marks a sync job failed and preserves any partial counts already gathered. */
async function failJob(
  jobId: string,
  message: string,
  partial: UpsertResult,
): Promise<void> {
  const now = new Date();
  await db
    .update(syncJobs)
    .set({
      status: "failed",
      error: message.slice(0, 1000),
      total: partial.total,
      createdCount: partial.created,
      updatedCount: partial.updated,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(syncJobs.id, jobId));
}

/**
 * Runs a manual sync for a single entity: validates the connection, records a
 * sync_jobs row, pulls + upserts, then finalizes. On failure the job row is
 * marked failed and the original error is rethrown so the API returns a precise
 * message. Tenant scoping flows from `storeId` through every query.
 */
export async function runEntitySync(
  storeId: string,
  entity: SyncEntity,
  trigger: SyncTrigger,
): Promise<SyncJobRow> {
  const connection = await requireSyncableConnection(storeId);
  await assertNoRunningSync(storeId);
  const job = await startJob(storeId, entity, trigger);

  try {
    const totals = await pullEntity(connection, storeId, ENTITY_CONFIG[entity]);
    const finished = await completeJob(job.id, totals);
    await touchLastSync(storeId);
    return finished;
  } catch (err) {
    // Only operational (AppError) messages are safe to expose; everything else
    // (DB driver text, parse internals) is logged server-side and replaced with
    // a generic message so it never leaks to the client or sync_jobs.error.
    const message =
      err instanceof AppError
        ? err.message
        : "Sync failed due to an internal error.";
    await failJob(job.id, message, { total: 0, created: 0, updated: 0 });
    logger.error({ err, storeId, entity }, "Entity sync failed");
    throw err instanceof AppError ? err : new ServiceUnavailableError(message);
  }
}

/**
 * Runs a full sync (customers, then products, then orders). The order matters:
 * customers and products are synced first so orders can resolve their customer
 * and line-item product mappings. Counts are summed across all three entities.
 */
export async function runFullSync(
  storeId: string,
  trigger: SyncTrigger,
): Promise<SyncJobRow> {
  const connection = await requireSyncableConnection(storeId);
  await assertNoRunningSync(storeId);
  const job = await startJob(storeId, "all", trigger);
  const totals: UpsertResult = { total: 0, created: 0, updated: 0 };

  try {
    const order: SyncEntity[] = ["customer", "product", "order"];
    for (const entity of order) {
      const result = await pullEntity(
        connection,
        storeId,
        ENTITY_CONFIG[entity],
      );
      totals.total += result.total;
      totals.created += result.created;
      totals.updated += result.updated;
    }
    const finished = await completeJob(job.id, totals);
    await touchLastSync(storeId);
    return finished;
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : "Sync failed due to an internal error.";
    await failJob(job.id, message, totals);
    logger.error({ err, storeId }, "Full sync failed");
    throw err instanceof AppError ? err : new ServiceUnavailableError(message);
  }
}

/** Lists recent sync jobs for a store, newest first (for GET /sync/status). */
export async function listRecentSyncJobs(
  storeId: string,
  limit = 10,
): Promise<SyncJobRow[]> {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.storeId, storeId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(limit);
}
