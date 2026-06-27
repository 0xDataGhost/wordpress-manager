import {
  PackageMinus,
  PackageX,
  RefreshCcw,
  SendHorizontal,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { DigitalAutomationType } from "@/lib/automations-api";

interface DigitalAutomationMeta {
  /** Arabic title shown on the automation card. */
  title: string;
  /** Short Arabic explanation of what the automation does. */
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the card's icon chip (light + dark friendly). */
  iconClass: string;
}

/** The six Phase 23 digital automation types, in display order. */
export const DIGITAL_AUTOMATION_TYPES: DigitalAutomationType[] = [
  "digital_low_stock_alert",
  "digital_out_of_stock_alert",
  "digital_failed_delivery_alert",
  "digital_replacement_rate_alert",
  "auto_assign_codes_on_paid_order",
  "auto_deliver_codes_on_paid_order",
];

const DIGITAL_TYPE_SET = new Set<string>(DIGITAL_AUTOMATION_TYPES);

/** True when a raw type string is one of the six digital automations. */
export function isDigitalAutomationType(type: string): boolean {
  return DIGITAL_TYPE_SET.has(type);
}

/** Per-type display metadata for the six digital automations (plan2 §23). */
export const DIGITAL_AUTOMATION_META: Record<
  DigitalAutomationType,
  DigitalAutomationMeta
> = {
  digital_low_stock_alert: {
    title: "تنبيه انخفاض الأكواد",
    description:
      "إنشاء إشعار عندما ينخفض مخزون أكواد منتج رقمي إلى الحد المحدد أو أقل.",
    icon: PackageMinus,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  digital_out_of_stock_alert: {
    title: "تنبيه نفاد الأكواد",
    description: "إنشاء إشعار عاجل عند نفاد مخزون أكواد منتج رقمي بالكامل.",
    icon: PackageX,
    iconClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  digital_failed_delivery_alert: {
    title: "تنبيه فشل التسليم",
    description:
      "إنشاء إشعار عند فشل تسليم الأكواد بعد عدد المحاولات المحدد.",
    icon: SendHorizontal,
    iconClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  digital_replacement_rate_alert: {
    title: "تنبيه ارتفاع الاستبدالات",
    description:
      "إنشاء إشعار عندما تتجاوز نسبة استبدال الأكواد الحد المسموح خلال الفترة.",
    icon: RefreshCcw,
    iconClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  auto_assign_codes_on_paid_order: {
    title: "تعيين الأكواد تلقائياً",
    description:
      "تعيين الأكواد تلقائياً للطلبات المدفوعة في الحالات المحددة (إعادة التشغيل آمنة).",
    icon: Sparkles,
    iconClass: "bg-primary/10 text-primary",
  },
  auto_deliver_codes_on_paid_order: {
    title: "تسليم الأكواد تلقائياً",
    description:
      "تسليم الأكواد المعيّنة تلقائياً للطلبات المدفوعة عبر القناة المختارة.",
    icon: Truck,
    iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

/** Resolve a raw digital type to its metadata, tolerating unknown values. */
export function resolveDigitalAutomationMeta(
  type: string,
): DigitalAutomationMeta {
  return (
    DIGITAL_AUTOMATION_META[type as DigitalAutomationType] ?? {
      title: type,
      description: "",
      icon: Sparkles,
      iconClass: "bg-muted text-muted-foreground",
    }
  );
}

/* ------------------------------ Option labels ----------------------------- */

export const THRESHOLD_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "product_setting", label: "حسب إعداد المنتج" },
  { value: "global", label: "حد موحّد" },
];

export const DELIVER_CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "customer_link", label: "رابط العميل" },
  { value: "dashboard", label: "لوحة التحكم" },
];
