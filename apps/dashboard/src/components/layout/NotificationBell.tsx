import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listNotifications } from "@/lib/notifications-api";

/**
 * Topbar bell showing the store-wide unread notification count. Refreshes on
 * mount and on every route change (which covers marking notifications read on
 * the notifications page) — no realtime/polling, kept deliberately simple and
 * safe. A failed fetch is non-critical and leaves the badge unchanged.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await listNotifications({ status: "unread", limit: 1 });
      setUnread(result.unreadCount);
    } catch {
      // Non-critical: keep the current badge value on failure.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={
        unread > 0 ? `الإشعارات (${unread} غير مقروء)` : "الإشعارات"
      }
      title="الإشعارات"
      onClick={() => navigate("/notifications")}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 ? (
        <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
          {badge}
        </span>
      ) : null}
    </Button>
  );
}
