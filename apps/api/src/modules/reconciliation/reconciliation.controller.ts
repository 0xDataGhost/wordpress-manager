import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { reconcileStore } from "./reconciliation.service";

/**
 * POST /reconciliation/run — compare the mirror to WooCommerce and report
 * drift (the Connection page "reconcile now"). Tenant-scoped; settings.view.
 */
export async function runReconciliationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const result = await reconcileStore(storeId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SYNC_COMPLETED,
    entityType: AUDIT_ENTITY_TYPES.SYNC,
    entityId: null,
    message:
      result.driftedDomains.length > 0
        ? `فحص المطابقة: انحراف في ${result.driftedDomains.join(", ")}`
        : "فحص المطابقة: كل النطاقات متطابقة",
    metadata: { driftedDomains: result.driftedDomains },
  });
  res.status(200).json(successResponse(result, ""));
}
