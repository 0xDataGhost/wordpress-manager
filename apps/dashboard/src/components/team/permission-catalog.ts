/**
 * Maps granular permission keys (e.g. "digital_inventory.reveal") to Arabic,
 * module-grouped display data for the Team & Permissions UI.
 *
 * A permission key is `<module>.<action>`. The module prefix may itself contain
 * underscores (e.g. `digital_inventory`), so we split on the FIRST dot only.
 * This is purely presentational — the backend remains the source of truth.
 */

/** Module prefix → Arabic label, in the display order used across the UI. */
const MODULE_LABELS: { key: string; label: string }[] = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "products", label: "المنتجات" },
  { key: "orders", label: "الطلبات" },
  { key: "customers", label: "العملاء" },
  { key: "team", label: "الموظفون والصلاحيات" },
  { key: "automations", label: "الأتمتة" },
  { key: "ai", label: "المساعد الذكي" },
  { key: "digital_inventory", label: "المخزون الرقمي" },
  { key: "digital_delivery", label: "التسليم الرقمي" },
  { key: "digital_suppliers", label: "الموردون" },
  { key: "digital_reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات" },
];

const MODULE_ORDER = new Map(MODULE_LABELS.map((m, i) => [m.key, i]));
const MODULE_LABEL_BY_KEY = new Map(MODULE_LABELS.map((m) => [m.key, m.label]));

/** Action suffix → Arabic label. Unknown actions fall back to the raw suffix. */
const ACTION_LABELS: Record<string, string> = {
  view: "عرض",
  create: "إنشاء",
  edit: "تعديل",
  delete: "حذف",
  import: "استيراد",
  reveal: "كشف",
  export: "تصدير",
  assign: "تعيين",
  deliver: "تسليم",
  retry: "إعادة المحاولة",
};

/** Splits a key into its module prefix and action suffix on the first dot. */
function splitKey(key: string): { module: string; action: string } {
  const dot = key.indexOf(".");
  if (dot === -1) return { module: key, action: "" };
  return { module: key.slice(0, dot), action: key.slice(dot + 1) };
}

export function moduleLabel(moduleKey: string): string {
  return MODULE_LABEL_BY_KEY.get(moduleKey) ?? moduleKey;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export interface PermissionItem {
  key: string;
  action: string;
  actionLabel: string;
}

export interface PermissionModuleGroup {
  moduleKey: string;
  moduleLabel: string;
  permissions: PermissionItem[];
}

/**
 * Groups a role's permission keys by module, in the canonical module order.
 * Only modules the role actually holds permissions in are returned. Unknown
 * module prefixes are grouped under their own (raw) key, sorted last.
 */
export function groupPermissionsByModule(
  keys: string[],
): PermissionModuleGroup[] {
  const groups = new Map<string, PermissionItem[]>();
  for (const key of keys) {
    const { module, action } = splitKey(key);
    const list = groups.get(module) ?? [];
    list.push({ key, action, actionLabel: actionLabel(action) });
    groups.set(module, list);
  }

  return [...groups.entries()]
    .map(([moduleKey, permissions]) => ({
      moduleKey,
      moduleLabel: moduleLabel(moduleKey),
      permissions: permissions.sort((a, b) =>
        a.actionLabel.localeCompare(b.actionLabel, "ar"),
      ),
    }))
    .sort((a, b) => {
      const ai = MODULE_ORDER.get(a.moduleKey) ?? Number.MAX_SAFE_INTEGER;
      const bi = MODULE_ORDER.get(b.moduleKey) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || a.moduleLabel.localeCompare(b.moduleLabel, "ar");
    });
}

/** Distinct permission keys across all roles — the size of the live catalog. */
export function countDistinctPermissions(
  roles: { permissions: string[] }[],
): number {
  const set = new Set<string>();
  for (const role of roles) {
    for (const key of role.permissions) set.add(key);
  }
  return set.size;
}
