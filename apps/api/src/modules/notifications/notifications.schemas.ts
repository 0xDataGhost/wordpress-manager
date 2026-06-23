import { z } from "zod";

/**
 * Query for GET /notifications.
 *
 * `status` optionally narrows to read or unread; omitted returns all.
 * Pagination matches the other modules (page ≥ 1, limit 1..100, default 20).
 */
export const listNotificationsQuerySchema = z.object({
  status: z.enum(["read", "unread"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Route params carrying a notification id. */
export const notificationParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type NotificationParams = z.infer<typeof notificationParamsSchema>;
