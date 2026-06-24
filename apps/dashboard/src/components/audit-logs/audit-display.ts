import type { StatusTone } from "@/components/shared/StatusBadge";

interface ActionMeta {
  label: string;
  tone: StatusTone;
}

/**
 * Arabic label + badge tone for each known audit action. `action` is free text
 * on the backend, so resolveAuditAction falls back to the raw value for any
 * unknown action (forward-compatible with future kinds).
 */
export const AUDIT_ACTION_META: Record<string, ActionMeta> = {
  "auth.login": { label: "تسجيل دخول", tone: "info" },
  "auth.logout": { label: "تسجيل خروج", tone: "neutral" },
  "product.created": { label: "إنشاء منتج", tone: "success" },
  "product.updated": { label: "تعديل منتج", tone: "info" },
  "product.archived": { label: "أرشفة منتج", tone: "warning" },
  "order.notes_updated": { label: "تعديل ملاحظات طلب", tone: "info" },
  "customer.notes_updated": { label: "تعديل ملاحظات عميل", tone: "info" },
  "settings.updated": { label: "تعديل الإعدادات", tone: "info" },
  "automation.enabled": { label: "تفعيل أتمتة", tone: "success" },
  "automation.disabled": { label: "إيقاف أتمتة", tone: "warning" },
  "automation.config_updated": { label: "تعديل إعدادات أتمتة", tone: "info" },
  "connection.changed": { label: "تغيير ربط المتجر", tone: "info" },
  "sync.started": { label: "بدء مزامنة", tone: "info" },
  "sync.completed": { label: "اكتمال مزامنة", tone: "success" },
  "sync.failed": { label: "فشل مزامنة", tone: "danger" },
  "webhook.processed": { label: "معالجة ويب هوك", tone: "success" },
  "webhook.failed": { label: "فشل ويب هوك", tone: "danger" },
  "ai.used": { label: "استخدام المساعد الذكي", tone: "info" },
};

/** Resolve a raw action to its label + tone, tolerating unknown values. */
export function resolveAuditAction(action: string): ActionMeta {
  return AUDIT_ACTION_META[action] ?? { label: action, tone: "neutral" };
}

/** Arabic label for each known entity type, tolerating unknown values. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: "مستخدم",
  product: "منتج",
  order: "طلب",
  customer: "عميل",
  settings: "الإعدادات",
  automation: "أتمتة",
  connection: "ربط المتجر",
  sync: "مزامنة",
  webhook: "ويب هوك",
  ai: "المساعد الذكي",
};

/** Resolve a raw entity type to its Arabic label, tolerating unknown values. */
export function resolveAuditEntity(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}
