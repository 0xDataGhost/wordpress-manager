import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { getConnector } from "../../middleware/authenticate-connector";
import { toSyncJobDto } from "./sync.serializer";
import {
  listRecentSyncJobs,
  runEntitySync,
  runFullSync,
  type SyncEntity,
} from "./sync.service";
import type { WpSyncTriggerInput } from "./sync.schemas";

/** Wraps a finished sync job in the standard response envelope. */
function jobResponse(res: Response, job: ReturnType<typeof toSyncJobDto>): void {
  res.status(200).json(successResponse({ job }, "Sync completed"));
}

/** Builds a JWT-authenticated single-entity sync handler. */
function entitySyncHandler(entity: SyncEntity) {
  return async (req: Request, res: Response): Promise<void> => {
    const { storeId } = getAuth(req);
    const job = await runEntitySync(storeId, entity, "dashboard");
    jobResponse(res, toSyncJobDto(job));
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
  const { storeId } = getAuth(req);
  const job = await runFullSync(storeId, "dashboard");
  jobResponse(res, toSyncJobDto(job));
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

  const job =
    entity === "all"
      ? await runFullSync(storeId, "wordpress")
      : await runEntitySync(storeId, entity, "wordpress");

  res
    .status(200)
    .json(successResponse({ job: toSyncJobDto(job) }, "Sync completed"));
}
