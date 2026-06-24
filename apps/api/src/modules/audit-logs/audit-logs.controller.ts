import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { toAuditLogDto } from "./audit-logs.serializer";
import { listAuditLogs } from "./audit-logs.service";
import type { ListAuditLogsQuery } from "./audit-logs.schemas";

/** GET /audit-logs — list the current store's audit logs (settings.view). */
export async function listAuditLogsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListAuditLogsQuery;
  const result = await listAuditLogs(storeId, query);

  res.status(200).json(
    successResponse(
      {
        items: result.items.map((row) => toAuditLogDto(row.log, row.user)),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      },
      "",
    ),
  );
}
