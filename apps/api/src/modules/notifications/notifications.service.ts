import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  notifications,
  type NotificationRow,
} from "../../db/schema/notifications";
import { NotFoundError } from "../../lib/errors";
import type { ListNotificationsQuery } from "./notifications.schemas";

export interface ListNotificationsResult {
  items: NotificationRow[];
  total: number;
  /** Store-wide unread total, independent of the filter (for the topbar badge). */
  unreadCount: number;
  page: number;
  limit: number;
}

/**
 * Lists a store's notifications with an optional read/unread filter and
 * pagination. Ordered newest-first with a stable id tiebreaker so rows never
 * shuffle across page boundaries (deterministic sort). `unreadCount` always
 * reflects the store's total unread regardless of the active filter, so the
 * notifications page and the topbar badge can reuse it.
 */
export async function listNotifications(
  storeId: string,
  query: ListNotificationsQuery,
): Promise<ListNotificationsResult> {
  const conditions = [eq(notifications.storeId, storeId)];
  if (query.status === "unread") {
    conditions.push(isNull(notifications.readAt));
  } else if (query.status === "read") {
    conditions.push(sql`${notifications.readAt} is not null`);
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(notifications).where(whereClause),
    db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(eq(notifications.storeId, storeId), isNull(notifications.readAt)),
      ),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    unreadCount: Number(unread[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Marks one notification as read. Idempotent: a row already read keeps its
 * original `read_at` (coalesce). Scoped to the store — throws NotFound when the
 * notification does not belong to it. Returns the refreshed row.
 */
export async function markNotificationRead(
  storeId: string,
  id: string,
): Promise<NotificationRow> {
  const [updated] = await db
    .update(notifications)
    .set({
      readAt: sql`coalesce(${notifications.readAt}, now())`,
      updatedAt: new Date(),
    })
    .where(and(eq(notifications.storeId, storeId), eq(notifications.id, id)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Notification not found");
  }
  return updated;
}

/**
 * Marks every unread notification in the store as read. Returns how many rows
 * were updated (0 when there was nothing unread). Store-scoped — only the
 * caller's tenant is touched.
 */
export async function markAllNotificationsRead(
  storeId: string,
): Promise<{ updated: number }> {
  const now = new Date();
  const updated = await db
    .update(notifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(eq(notifications.storeId, storeId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });

  return { updated: updated.length };
}
