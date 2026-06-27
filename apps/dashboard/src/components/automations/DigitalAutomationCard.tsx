import { useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ORDER_STATUS_META } from "@/components/orders/order-status";
import { AutomationLogsPanel } from "@/components/automations/AutomationLogsPanel";
import {
  DELIVER_CHANNEL_OPTIONS,
  resolveDigitalAutomationMeta,
  THRESHOLD_MODE_OPTIONS,
} from "@/components/automations/digital-automation-display";
import {
  updateAutomation,
  type AutomationConfig,
  type AutomationDto,
} from "@/lib/automations-api";
import { cn } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Paid-order statuses offered for the auto-assign / auto-deliver automations. */
const PAID_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "processing", label: ORDER_STATUS_META.processing.label },
  { value: "completed", label: ORDER_STATUS_META.completed.label },
  { value: "on-hold", label: ORDER_STATUS_META["on-hold"].label },
];

/** A stable, order-insensitive serialization for dirty-checking the config. */
function stableKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${[...value].map(stableKey).sort().join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${k}:${stableKey(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function asString(value: unknown, fallback = ""): string {
  return value === undefined || value === null ? fallback : String(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/**
 * Builds the config payload to persist for a digital automation type from its
 * working form values. Returns null (with no payload) when a value is invalid,
 * so the card can surface a friendly message before calling the API. The server
 * re-validates every field with Zod — this is a UX guard only.
 */
function buildConfig(
  type: string,
  form: AutomationConfig,
): AutomationConfig | null {
  switch (type) {
    case "digital_low_stock_alert": {
      const mode = asString(form.thresholdMode, "product_setting");
      if (mode === "global") {
        const n = Number(form.globalThreshold);
        if (!Number.isFinite(n) || n < 0) return null;
        return { thresholdMode: "global", globalThreshold: Math.trunc(n) };
      }
      return { thresholdMode: "product_setting" };
    }
    case "digital_out_of_stock_alert":
      return { notifyRoles: asStringArray(form.notifyRoles) };
    case "digital_failed_delivery_alert": {
      const n = Number(form.maxAttempts);
      if (!Number.isInteger(n) || n < 1) return null;
      return { maxAttempts: n };
    }
    case "digital_replacement_rate_alert": {
      const days = Number(form.windowDays);
      const rate = Number(form.maxReplacementRate);
      if (!Number.isInteger(days) || days < 1) return null;
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
      return { windowDays: days, maxReplacementRate: rate };
    }
    case "auto_assign_codes_on_paid_order": {
      const statuses = asStringArray(form.statuses);
      if (statuses.length === 0) return null;
      return { statuses, allowPartial: Boolean(form.allowPartial) };
    }
    case "auto_deliver_codes_on_paid_order": {
      const statuses = asStringArray(form.statuses);
      if (statuses.length === 0) return null;
      const channel = asString(form.channel, "customer_link");
      return { statuses, channel };
    }
    default:
      return null;
  }
}

interface DigitalAutomationCardProps {
  automation: AutomationDto;
  canEdit: boolean;
  onChange: (updated: AutomationDto) => void;
}

export function DigitalAutomationCard({
  automation,
  canEdit,
  onChange,
}: DigitalAutomationCardProps) {
  const meta = resolveDigitalAutomationMeta(automation.type);
  const Icon = meta.icon;

  const [form, setForm] = useState<AutomationConfig>(() => ({
    ...automation.config,
  }));
  const dirty = stableKey(buildConfig(automation.type, form)) !==
    stableKey(automation.config);

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  function patch(next: AutomationConfig) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  async function handleToggle(nextEnabled: boolean) {
    if (!canEdit) return;
    setBanner(null);
    setToggling(true);
    try {
      const updated = await updateAutomation(automation.id, {
        enabled: nextEnabled,
      });
      onChange(updated);
    } catch (err) {
      setBanner({
        tone: "error",
        message:
          err instanceof Error ? err.message : "تعذّر تغيير حالة الأتمتة.",
      });
    } finally {
      setToggling(false);
    }
  }

  async function handleSave() {
    if (!canEdit) return;
    const config = buildConfig(automation.type, form);
    if (!config) {
      setBanner({ tone: "error", message: "القيمة المُدخلة غير صالحة." });
      return;
    }
    setBanner(null);
    setSaving(true);
    try {
      const updated = await updateAutomation(automation.id, { config });
      onChange(updated);
      setForm({ ...updated.config });
      setBanner({ tone: "success", message: "تم حفظ الإعدادات." });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "تعذّر حفظ الإعدادات.",
      });
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canEdit || saving;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header: icon + title/description + enabled toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                meta.iconClass,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h3 className="text-base font-semibold leading-tight">
                {meta.title}
              </h3>
              <p className="max-w-prose text-sm text-muted-foreground">
                {meta.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <Switch
              checked={automation.enabled}
              onCheckedChange={(v) => void handleToggle(v)}
              disabled={!canEdit || toggling}
              aria-label={automation.enabled ? "تعطيل الأتمتة" : "تفعيل الأتمتة"}
            />
            <span
              className={cn(
                "text-xs font-medium",
                automation.enabled ? "text-success" : "text-muted-foreground",
              )}
            >
              {automation.enabled ? "مفعّلة" : "متوقفة"}
            </span>
          </div>
        </div>

        {banner ? (
          <div
            role="alert"
            className={cn(
              "mt-4 rounded-md border px-3 py-2 text-sm",
              banner.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/5 text-destructive",
            )}
          >
            {banner.message}
          </div>
        ) : null}

        {/* Config editor (per type) */}
        <div className="mt-4 rounded-lg border bg-muted/30 p-4">
          <DigitalConfigFields
            type={automation.type}
            id={automation.id}
            form={form}
            onPatch={patch}
            disabled={disabled}
          />

          <div className="mt-4 flex items-center gap-2">
            {canEdit ? (
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
              >
                <Save className="h-4 w-4" />
                {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                العرض فقط — تحتاج صلاحية «تعديل الأتمتة».
              </span>
            )}
          </div>

          <div className="mt-2">
            <AutomationLogsPanel automationId={automation.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DigitalConfigFieldsProps {
  type: string;
  id: string;
  form: AutomationConfig;
  onPatch: (next: AutomationConfig) => void;
  disabled: boolean;
}

/** Renders the per-type config controls for a digital automation. */
function DigitalConfigFields({
  type,
  id,
  form,
  onPatch,
  disabled,
}: DigitalConfigFieldsProps) {
  const fieldId = (suffix: string) => `digital-automation-${id}-${suffix}`;

  if (type === "digital_low_stock_alert") {
    const mode = asString(form.thresholdMode, "product_setting");
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("mode")}>طريقة تحديد الحد</Label>
          <select
            id={fieldId("mode")}
            className={cn(inputClass, "max-w-xs")}
            disabled={disabled}
            value={mode}
            onChange={(e) => onPatch({ thresholdMode: e.target.value })}
          >
            {THRESHOLD_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {mode === "global" ? (
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("threshold")}>الحد الموحّد للأكواد</Label>
            <Input
              id={fieldId("threshold")}
              type="number"
              min={0}
              inputMode="numeric"
              className="max-w-40"
              disabled={disabled}
              value={asString(form.globalThreshold, "5")}
              onChange={(e) => onPatch({ globalThreshold: e.target.value })}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            يُستخدم حد المخزون المنخفض المحدّد في إعدادات كل منتج رقمي.
          </p>
        )}
      </div>
    );
  }

  if (type === "digital_out_of_stock_alert") {
    const roles = asStringArray(form.notifyRoles);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("roles")}>الأدوار المعنية بالتنبيه (اختياري)</Label>
        <Input
          id={fieldId("roles")}
          className="max-w-md"
          disabled={disabled}
          value={roles.join("، ")}
          placeholder="Owner، Manager"
          onChange={(e) =>
            onPatch({
              notifyRoles: e.target.value
                .split(/[,،]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          أسماء الأدوار مفصولة بفاصلة. تُدرَج في تفاصيل الإشعار (الإشعارات تظهر
          لكل من يملك صلاحية لوحة التحكم).
        </p>
      </div>
    );
  }

  if (type === "digital_failed_delivery_alert") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("attempts")}>أقصى عدد محاولات قبل التنبيه</Label>
        <Input
          id={fieldId("attempts")}
          type="number"
          min={1}
          inputMode="numeric"
          className="max-w-40"
          disabled={disabled}
          value={asString(form.maxAttempts, "1")}
          onChange={(e) => onPatch({ maxAttempts: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          يتم التنبيه عند فشل التسليم بعد هذا العدد من المحاولات.
        </p>
      </div>
    );
  }

  if (type === "digital_replacement_rate_alert") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("window")}>فترة الحساب (أيام)</Label>
          <Input
            id={fieldId("window")}
            type="number"
            min={1}
            inputMode="numeric"
            className="max-w-40"
            disabled={disabled}
            value={asString(form.windowDays, "7")}
            onChange={(e) => onPatch({ windowDays: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("rate")}>أقصى نسبة استبدال (0 إلى 1)</Label>
          <Input
            id={fieldId("rate")}
            type="number"
            min={0}
            max={1}
            step={0.01}
            inputMode="decimal"
            dir="ltr"
            className="max-w-40"
            disabled={disabled}
            value={asString(form.maxReplacementRate, "0.05")}
            onChange={(e) => onPatch({ maxReplacementRate: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            مثال: 0.05 تعني 5%.
          </p>
        </div>
      </div>
    );
  }

  if (type === "auto_assign_codes_on_paid_order") {
    return (
      <div className="space-y-3">
        <StatusCheckboxes
          label="حالات الطلب المؤهلة للتعيين"
          value={asStringArray(form.statuses)}
          disabled={disabled}
          onChange={(statuses) => onPatch({ statuses })}
        />
        <ToggleRow
          label="السماح بالتعيين الجزئي عند نقص الأكواد"
          checked={Boolean(form.allowPartial)}
          disabled={disabled}
          onChange={(allowPartial) => onPatch({ allowPartial })}
        />
      </div>
    );
  }

  if (type === "auto_deliver_codes_on_paid_order") {
    return (
      <div className="space-y-3">
        <StatusCheckboxes
          label="حالات الطلب المؤهلة للتسليم"
          value={asStringArray(form.statuses)}
          disabled={disabled}
          onChange={(statuses) => onPatch({ statuses })}
        />
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("channel")}>قناة التسليم</Label>
          <select
            id={fieldId("channel")}
            className={cn(inputClass, "max-w-xs")}
            disabled={disabled}
            value={asString(form.channel, "customer_link")}
            onChange={(e) => onPatch({ channel: e.target.value })}
          >
            {DELIVER_CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return null;
}

interface StatusCheckboxesProps {
  label: string;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}

/** Multi-select of paid-order statuses as bordered checkbox chips. */
function StatusCheckboxes({
  label,
  value,
  disabled,
  onChange,
}: StatusCheckboxesProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {PAID_STATUS_OPTIONS.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                checked ? "border-primary bg-primary/5" : "border-input",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, opt.value]
                      : value.filter((v) => v !== opt.value),
                  )
                }
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** A label + Switch row for a boolean config field. */
function ToggleRow({ label, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
