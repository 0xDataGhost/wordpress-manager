import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import {
  toAutomationDto,
  toAutomationLogDto,
} from "./automations.serializer";
import {
  listAutomationLogs,
  listAutomations,
  updateAutomation,
} from "./automations.service";
import type {
  AutomationParams,
  ListAutomationLogsQuery,
  UpdateAutomationInput,
} from "./automations.schemas";

/** GET /automations — list the store's automations (automations.view). */
export async function listAutomationsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const rows = await listAutomations(storeId);
  res
    .status(200)
    .json(successResponse({ items: rows.map(toAutomationDto) }, ""));
}

/** PATCH /automations/:id — update enabled/config (automations.edit). */
export async function updateAutomationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as AutomationParams;
  const body = req.body as UpdateAutomationInput;
  const updated = await updateAutomation(storeId, id, body);
  res
    .status(200)
    .json(successResponse(toAutomationDto(updated), "Automation updated"));
}

/** GET /automations/:id/logs — list an automation's run logs (automations.view). */
export async function listAutomationLogsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as AutomationParams;
  const query = req.query as unknown as ListAutomationLogsQuery;

  // listAutomationLogs verifies store ownership and returns the automation, so
  // we surface it alongside the logs without a second fetch.
  const logs = await listAutomationLogs(storeId, id, query);

  res.status(200).json(
    successResponse(
      {
        automation: toAutomationDto(logs.automation),
        items: logs.items.map(toAutomationLogDto),
        pagination: {
          total: logs.total,
          page: logs.page,
          limit: logs.limit,
          totalPages: Math.max(1, Math.ceil(logs.total / logs.limit)),
        },
      },
      "",
    ),
  );
}
