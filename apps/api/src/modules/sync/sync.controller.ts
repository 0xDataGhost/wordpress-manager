import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { getConnector } from "../../middleware/authenticate-connector";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import type { SyncJobRow, SyncTrigger } from "../../db/schema/sync-jobs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toSyncJobDto } from "./sync.serializer";
import {
  listRecentSyncJobs,
  runEntitySync,
  runFullSync,
  type SyncEntity,
} from "./sync.service";
import type { WpSyncTriggerInput } from "./sync.schemas";

/** Arabic labels for the synced entity, used in audit messages. */
const SYNC_LABELS: Record<SyncEntity | "all", string> = {
  product: "المنتجات",
  order: "الطلبات",
  customer: "العملاء",
  all: "الكل",
};

interface SyncAuditContext {
  storeId: string;
  /** null for connector-driven syncs (no dashboard user). */
  userId: string | null;
  entity: SyncEntity | "all";
  trigger: SyncTrigger;
}

/**
 * Runs a sync while best-effort auditing its lifecycle (started → completed /
 * failed). The audit calls never throw, so they cannot affect the sync or the
 * response; on failure the original error is rethrown to the error handler so
 * the client still gets the precise message.
 */
async function runSyncWithAudit(
  req: Request,
  res: Response,
  ctx: SyncAuditContext,
  run: () => Promise<SyncJobRow>,
): Promise<void> {
  const label = SYNC_LABELS[ctx.entity];
  const base = {
    entityType: AUDIT_ENTITY_TYPES.SYNC,
    storeId: ctx.storeId,
    userId: ctx.userId,
  };

  await recordAuditFromRequest(req, {
    ...base,
    action: AUDIT_ACTIONS.SYNC_STARTED,
    message: `بدأت مزامنة يدوية: ${label}`,
    metadata: { entity: ctx.entity, trigger: ctx.trigger },
  });

  try {
    const job = await run();
    await recordAuditFromRequest(req, {
      ...base,
      action: AUDIT_ACTIONS.SYNC_COMPLETED,
      entityId: job.id,
      message: `اكتملت المزامنة: ${label}`,
      metadata: {
        entity: ctx.entity,
        trigger: ctx.trigger,
        total: job.total,
        created: job.createdCount,
        updated: job.updatedCount,
      },
    });
    res.status(200).json(successResponse({ job: toSyncJobDto(job) }, "Sync completed"));
  } catch (err) {
    const message = (err instanceof Error ? err.message : "Unexpected error").slice(
      0,
      500,
    );
    await recordAuditFromRequest(req, {
      ...base,
      action: AUDIT_ACTIONS.SYNC_FAILED,
      message: `فشلت المزامنة: ${label}`,
      metadata: { entity: ctx.entity, trigger: ctx.trigger, error: message },
    });
    throw err;
  }
}

/** Builds a JWT-authenticated single-entity sync handler. */
function entitySyncHandler(entity: SyncEntity) {
  return async (req: Request, res: Response): Promise<void> => {
    const { storeId, userId } = getAuth(req);
    await runSyncWithAudit(
      req,
      res,
      { storeId, userId, entity, trigger: "dashboard" },
      () => runEntitySync(storeId, entity, "dashboard"),
    );
  };
}

/** POST /sync/products — pull WooCommerce products (JWT, settings.edit). */
export const syncProductsHandler = entitySyncHandler("product");

/** POST /sync/orders — pull WooCommerce orders (JWT, settings.edit). */
export const syncOrdersHandler = entitySyncHandler("order");

/** POST /sync/customers — pull WooCommerce customers (JWT, settings.edit). */
export const syncCustomersHandler = entitySyncHandler("customer");

/** POST /sync/all — pull customers, products and orders (JWT, settings.edit). */
export async function syncAllHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  await runSyncWithAudit(
    req,
    res,
    { storeId, userId, entity: "all", trigger: "dashboard" },
    () => runFullSync(storeId, "dashboard"),
  );
}

/** GET /sync/status — recent sync jobs for the store (JWT, settings.view). */
export async function syncStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const jobs = await listRecentSyncJobs(storeId);
  res
    .status(200)
    .json(successResponse({ jobs: jobs.map(toSyncJobDto) }, ""));
}

/**
 * POST /wp/sync — connector-authenticated. Lets the WordPress "Manual Sync"
 * button ask the SaaS to run a sync; the SaaS then pulls the requested entity
 * (or everything) from the connector. Keeps all sync business logic on the SaaS
 * side so the plugin stays a thin connector.
 */
export async function wpTriggerSyncHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getConnector(req);
  const { entity } = req.body as WpSyncTriggerInput;

  await runSyncWithAudit(
    req,
    res,
    // Connector-driven: no dashboard user.
    { storeId, userId: null, entity, trigger: "wordpress" },
    () =>
      entity === "all"
        ? runFullSync(storeId, "wordpress")
        : runEntitySync(storeId, entity, "wordpress"),
  );
}
