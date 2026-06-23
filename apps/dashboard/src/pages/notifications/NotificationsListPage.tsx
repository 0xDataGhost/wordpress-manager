import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  resolveNotificationSeverity,
  resolveNotificationType,
} from "@/components/notifications/notification-display";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationDto,
  type NotificationPagination,
  type NotificationStatusFilter,
} from "@/lib/notifications-api";
import { formatDateTime, cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type Filter = "all" | NotificationStatusFilter;
type Banner = { tone: "success" | "error"; message: string };

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير المقروءة" },
  { value: "read", label: "المقروءة" },
];

function NotificationCard({
  notification,
  isMarking,
  onMarkRead,
}: {
  notification: NotificationDto;
  isMarking: boolean;
  onMarkRead: (id: string) => void;
}) {
  const severity = resolveNotificationSeverity(notification.severity);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-4 ps-5 transition-colors",
        !notification.isRead && "bg-muted/40",
      )}
    >
      {/* Severity accent bar on the inline-start edge (RTL-aware). */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 start-0 w-1.5",
          severity.accent,
        )}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!notification.isRead ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary"
              aria-label="غير مقروء"
            />
          ) : null}
          <h3 className="text-sm font-semibold">{notification.title}</h3>
          <StatusBadge label={severity.label} tone={severity.tone} />
          <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            {resolveNotificationType(notification.type)}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{notification.message}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <time className="text-xs text-muted-foreground">
            {formatDateTime(notification.createdAt)}
          </time>
          {!notification.isRead ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isMarking}
              onClick={() => onMarkRead(notification.id)}
            >
              <Check className="h-4 w-4" />
              {isMarking ? "جارٍ…" : "تحديد كمقروء"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              مقروء{notification.readAt ? ` · ${formatDateTime(notification.readAt)}` : ""}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function NotificationsListPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<NotificationDto[]>([]);
  const [pagination, setPagination] = useState<NotificationPagination | null>(
    null,
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listNotifications({
        status: filter === "all" ? undefined : filter,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setPagination(result.pagination);
      setUnreadCount(result.unreadCount);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectFilter(next: Filter) {
    setBanner(null);
    setPage(1);
    setFilter(next);
  }

  async function handleMarkRead(id: string) {
    setBanner(null);
    setMarkingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await markNotificationRead(id);
      setUnreadCount((c) => Math.max(0, c - 1));
      if (filter === "unread") {
        // The row no longer matches the active filter — drop it from view and
        // keep the page total in sync with the server.
        setItems((prev) => prev.filter((n) => n.id !== id));
        setPagination((p) =>
          p
            ? {
                ...p,
                total: Math.max(0, p.total - 1),
                totalPages: Math.max(
                  1,
                  Math.ceil(Math.max(0, p.total - 1) / p.limit),
                ),
              }
            : p,
        );
      } else {
        // Reflect the read state in place.
        setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    } catch (err) {
      setBanner({
        tone: "error",
        message:
          err instanceof Error ? err.message : "تعذّر تحديد الإشعار كمقروء.",
      });
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleMarkAll() {
    setBanner(null);
    setMarkingAll(true);
    try {
      const { updated } = await markAllNotificationsRead();
      setBanner({
        tone: "success",
        message:
          updated > 0
            ? `تم تحديد ${updated} إشعارًا كمقروء.`
            : "لا توجد إشعارات غير مقروءة.",
      });
      // Bulk change can span pages — reset to the first page and reload so the
      // list + counts stay exact (avoids being stranded on a now-empty page).
      // A single reload runs either way: directly on page 1, or via the load
      // effect when resetting the page.
      if (page === 1) {
        await load();
      } else {
        setPage(1);
      }
    } catch (err) {
      setBanner({
        tone: "error",
        message:
          err instanceof Error ? err.message : "تعذّر تحديد الإشعارات كمقروءة.",
      });
    } finally {
      setMarkingAll(false);
    }
  }

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الإشعارات"
        description="تنبيهات متجرك: الطلبات الجديدة، انخفاض المخزون، وفشل المزامنة وغيرها."
        actions={
          <Button
            variant="outline"
            disabled={markingAll || unreadCount === 0}
            onClick={() => void handleMarkAll()}
          >
            <CheckCheck className="h-4 w-4" />
            {markingAll ? "جارٍ…" : "تحديد الكل كمقروء"}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "ghost"}
              size="sm"
              onClick={() => selectFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? `${unreadCount} إشعار غير مقروء`
            : "لا إشعارات غير مقروءة"}
        </span>
      </div>

      {banner ? (
        <div
          role="alert"
          className={cn(
            "mb-4 rounded-md border px-4 py-3 text-sm",
            banner.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {banner.message}
        </div>
      ) : null}

      {loading ? (
        <LoadingState variant="skeleton" rows={5} />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="لا توجد إشعارات"
          description={
            filter === "unread"
              ? "لا توجد إشعارات غير مقروءة حاليًا."
              : "ستظهر هنا تنبيهات متجرك عند توفّرها."
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                isMarking={markingIds.has(n.id)}
                onMarkRead={(id) => void handleMarkRead(id)}
              />
            ))}
          </div>

          {total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                صفحة {page} من {totalPages} · {total} إشعار
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  التالي
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
