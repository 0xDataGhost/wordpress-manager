import type { StatusTone } from "@/components/shared/StatusBadge";
import type {
  NotificationSeverity,
  NotificationType,
} from "@/lib/notifications-api";

/** Arabic label for each known notification type, tolerating unknown values. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  new_order: "طلب جديد",
  low_stock: "مخزون منخفض",
  failed_sync: "فشل المزامنة",
  failed_automation: "فشل الأتمتة",
  daily_report: "التقرير اليومي",
  whatsapp_order_message: "رسالة واتساب",
};

/** Resolve a raw type string to its Arabic label, tolerating unknown values. */
export function resolveNotificationType(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type as NotificationType] ?? type;
}

interface SeverityMeta {
  label: string;
  tone: StatusTone;
  /** Tailwind background token for the card's inline-start accent bar. */
  accent: string;
}

/** Severity → badge tone, Arabic label, and accent color. */
export const NOTIFICATION_SEVERITY_META: Record<
  NotificationSeverity,
  SeverityMeta
> = {
  info: { label: "معلومة", tone: "info", accent: "bg-primary" },
  success: { label: "نجاح", tone: "success", accent: "bg-success" },
  warning: { label: "تحذير", tone: "warning", accent: "bg-warning" },
  error: { label: "خطأ", tone: "danger", accent: "bg-destructive" },
};

/** Resolve a raw severity to its label + tone + accent, tolerating unknowns. */
export function resolveNotificationSeverity(severity: string): SeverityMeta {
  return (
    NOTIFICATION_SEVERITY_META[severity as NotificationSeverity] ?? {
      label: severity,
      tone: "neutral",
      accent: "bg-muted-foreground",
    }
  );
}
