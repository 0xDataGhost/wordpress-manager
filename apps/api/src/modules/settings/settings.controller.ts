import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toSettingsDto } from "./settings.serializer";
import {
  getStoreSettings,
  updateStoreSettings,
} from "./settings.service";
import type { UpdateSettingsInput } from "./settings.schemas";

/** GET /settings — the current store's settings (settings.view). */
export async function getSettingsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const row = await getStoreSettings(storeId);
  res.status(200).json(successResponse(toSettingsDto(row), ""));
}

/** PATCH /settings — partial update of the store's settings (settings.edit). */
export async function updateSettingsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const body = req.body as UpdateSettingsInput;
  const updated = await updateStoreSettings(storeId, body);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: storeId,
    message: "حدّث إعدادات المتجر",
    // Changed category names only — never the values themselves.
    metadata: { categories: Object.keys(body) },
  });
  res
    .status(200)
    .json(successResponse(toSettingsDto(updated), "Settings updated"));
}
