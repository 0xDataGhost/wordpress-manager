import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import type {
  ListWpCommandsQuery,
  WpCommandParams,
} from "./wp-commands.schemas";
import {
  getWpCommandById,
  getWpCommandStats,
  listWpCommands,
  retryWpCommand,
} from "./wp-commands.service";
import { toWpCommandDto } from "./wp-commands.serializer";

/** GET /wp-commands — Command Center list (tenant-scoped, newest first). */
export async function listWpCommandsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListWpCommandsQuery;
  const result = await listWpCommands(storeId, query);
  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toWpCommandDto),
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

/** GET /wp-commands/stats — status counts for the header cards. */
export async function wpCommandStatsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const stats = await getWpCommandStats(storeId);
  res.status(200).json(successResponse(stats, ""));
}

/** GET /wp-commands/:id — one command's detail. */
export async function getWpCommandHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as WpCommandParams;
  const row = await getWpCommandById(storeId, id);
  if (!row) {
    throw new NotFoundError("Command not found");
  }
  res.status(200).json(successResponse(toWpCommandDto(row), ""));
}

/** POST /wp-commands/:id/retry — re-executes a failed/dead command. */
export async function retryWpCommandHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as WpCommandParams;
  const row = await retryWpCommand(storeId, id, userId);
  res.status(200).json(successResponse(toWpCommandDto(row), "Command retried"));
}
