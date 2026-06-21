import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { listRolesForStore } from "./roles.service";
import { toRoleDto } from "./roles.serializer";

/** GET /roles — system roles plus the current store's custom roles. */
export async function listRoles(req: Request, res: Response): Promise<void> {
  const { storeId } = getAuth(req);
  const roles = await listRolesForStore(storeId);
  res.status(200).json(successResponse(roles.map(toRoleDto), ""));
}
