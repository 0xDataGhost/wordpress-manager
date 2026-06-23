import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "./notifications.controller";
import {
  listNotificationsQuerySchema,
  notificationParamsSchema,
} from "./notifications.schemas";

const router = Router();

// Notifications are visible to anyone who can view the dashboard. Marking read
// shares the same permission since it only touches the caller's own store data
// (plan.md Phase 10: permission = dashboard.view).
const view = requirePermission("dashboard.view");

// GET /notifications            — list (read/unread filter + pagination)
router.get(
  "/",
  authenticate,
  view,
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(listNotificationsHandler),
);

// PATCH /notifications/:id/read — mark a single notification as read
router.patch(
  "/:id/read",
  authenticate,
  view,
  validate({ params: notificationParamsSchema }),
  asyncHandler(markNotificationReadHandler),
);

// POST /notifications/read-all  — mark every unread notification as read
router.post(
  "/read-all",
  authenticate,
  view,
  asyncHandler(markAllNotificationsReadHandler),
);

export default router;
