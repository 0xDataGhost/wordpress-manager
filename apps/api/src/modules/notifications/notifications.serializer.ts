import type { NotificationRow } from "../../db/schema/notifications";

/**
 * Public API shape of a notification. `isRead` is derived from `readAt` for the
 * UI's unread indicator; `metadata` passes the stored jsonb payload through
 * untouched (null when absent).
 */
export interface NotificationDto {
  id: string;
  storeId: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
  readAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    storeId: row.storeId,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    isRead: row.readAt !== null,
    readAt: row.readAt,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
