import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { toNotificationDto } from "./notifications.serializer";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.service";
import type {
  ListNotificationsQuery,
  NotificationParams,
} from "./notifications.schemas";

/** GET /notifications — list the current store's notifications (dashboard.view). */
export async function listNotificationsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListNotificationsQuery;
  const result = await listNotifications(storeId, query);

  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toNotificationDto),
        unreadCount: result.unreadCount,
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

/** PATCH /notifications/:id/read — mark one notification as read (dashboard.view). */
export async function markNotificationReadHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as NotificationParams;
  const updated = await markNotificationRead(storeId, id);
  res
    .status(200)
    .json(
      successResponse(toNotificationDto(updated), "Notification marked as read"),
    );
}

/** POST /notifications/read-all — mark all unread as read (dashboard.view). */
export async function markAllNotificationsReadHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const result = await markAllNotificationsRead(storeId);
  res
    .status(200)
    .json(successResponse(result, "All notifications marked as read"));
}
