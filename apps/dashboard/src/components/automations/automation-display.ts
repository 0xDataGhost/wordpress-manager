import {
  MessageCircle,
  PackageMinus,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/shared/StatusBadge";
import type {
  AutomationLogStatus,
  ClassicAutomationType,
} from "@/lib/automations-api";

interface AutomationMeta {
  /** Arabic title shown on the automation card. */
  title: string;
  /** Short Arabic explanation of what the automation does. */
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the card's icon chip (light + dark friendly). */
  iconClass: string;
}

/** Per-type display metadata for the three classic (Phase 11) automations. */
export const AUTOMATION_META: Record<ClassicAutomationType, AutomationMeta> = {
  low_stock_alert: {
    title: "تنبيه انخفاض المخزون",
    description:
      "إنشاء إشعار عندما ينخفض مخزون منتج نشط إلى الحد المحدد أو أقل.",
    icon: PackageMinus,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  daily_sales_report: {
    title: "تقرير المبيعات اليومي",
    description:
      "إنشاء ملخص يومي للمبيعات وعدد الطلبات وأفضل المنتجات والمخزون المنخفض.",
    icon: TrendingUp,
    iconClass: "bg-primary/10 text-primary",
  },
  whatsapp_order_message: {
    title: "رسالة واتساب للطلب",
    description:
      "تجهيز رسالة واتساب للعميل عند إنشاء طلب جديد. (محاكاة فقط — لا تُرسل رسائل فعلية بعد.)",
    icon: MessageCircle,
    iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

/** Resolve a raw type string to its metadata, tolerating unknown values. */
export function resolveAutomationMeta(type: string): AutomationMeta {
  return (
    AUTOMATION_META[type as ClassicAutomationType] ?? {
      title: type,
      description: "",
      icon: TrendingUp,
      iconClass: "bg-muted text-muted-foreground",
    }
  );
}

interface LogStatusMeta {
  label: string;
  tone: StatusTone;
}

/** Log status → Arabic label + badge tone. */
export const LOG_STATUS_META: Record<AutomationLogStatus, LogStatusMeta> = {
  success: { label: "نجاح", tone: "success" },
  skipped: { label: "تم التخطّي", tone: "neutral" },
  queued: { label: "في الطابور", tone: "info" },
  failed: { label: "فشل", tone: "danger" },
};

/** Resolve a raw log status to its label + tone, tolerating unknowns. */
export function resolveLogStatus(status: string): LogStatusMeta {
  return (
    LOG_STATUS_META[status as AutomationLogStatus] ?? {
      label: status,
      tone: "neutral",
    }
  );
}
