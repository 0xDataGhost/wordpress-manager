import { useState } from "react";
import { History, Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  resolveAutomationMeta,
  resolveLogStatus,
} from "@/components/automations/automation-display";
import {
  listAutomationLogs,
  updateAutomation,
  type AutomationDto,
  type AutomationLogDto,
} from "@/lib/automations-api";
import { cn, formatDateTime } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

const LOGS_LIMIT = 5;

/** Reads the single editable config value for an automation type as a string. */
function readConfigValue(automation: AutomationDto): string {
  const c = automation.config ?? {};
  switch (automation.type) {
    case "low_stock_alert":
      return String(c.threshold ?? 5);
    case "daily_sales_report":
      return String(c.time ?? "09:00");
    case "whatsapp_order_message":
      return String(c.message_template ?? "");
    default:
      return "";
  }
}

/** Builds the config patch payload for an automation type from the field value. */
function buildConfig(
  type: string,
  value: string,
): Record<string, unknown> | null {
  switch (type) {
    case "low_stock_alert": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return null;
      return { threshold: Math.trunc(n) };
    }
    case "daily_sales_report":
      return { time: value };
    case "whatsapp_order_message":
      return { message_template: value };
    default:
      return null;
  }
}

interface AutomationCardProps {
  automation: AutomationDto;
  canEdit: boolean;
  onChange: (updated: AutomationDto) => void;
}

export function AutomationCard({
  automation,
  canEdit,
  onChange,
}: AutomationCardProps) {
  const meta = resolveAutomationMeta(automation.type);
  const Icon = meta.icon;

  const [value, setValue] = useState(() => readConfigValue(automation));
  const savedValue = readConfigValue(automation);
  const dirty = value !== savedValue;

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<AutomationLogDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  async function handleToggle(next: boolean) {
    if (!canEdit) return;
    setBanner(null);
    setToggling(true);
    try {
      const updated = await updateAutomation(automation.id, { enabled: next });
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
    const config = buildConfig(automation.type, value);
    if (!config) {
      setBanner({ tone: "error", message: "القيمة المُدخلة غير صالحة." });
      return;
    }
    setBanner(null);
    setSaving(true);
    try {
      const updated = await updateAutomation(automation.id, { config });
      onChange(updated);
      setValue(readConfigValue(updated));
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

  async function loadLogs() {
    setLogsLoading(true);
    setLogsError(false);
    try {
      const result = await listAutomationLogs(automation.id, {
        limit: LOGS_LIMIT,
      });
      setLogs(result.items);
      setLogsLoaded(true);
    } catch {
      setLogsError(true);
    } finally {
      setLogsLoading(false);
    }
  }

  function toggleLogs() {
    const next = !logsOpen;
    setLogsOpen(next);
    if (next && !logsLoaded) {
      void loadLogs();
    }
  }

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
          <ConfigField
            automation={automation}
            value={value}
            onChange={setValue}
            disabled={!canEdit || saving}
          />

          <div className="mt-3 flex items-center justify-between gap-2">
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

            <Button variant="ghost" size="sm" onClick={toggleLogs}>
              <History className="h-4 w-4" />
              {logsOpen ? "إخفاء السجلات" : "عرض السجلات"}
            </Button>
          </div>
        </div>

        {/* Recent run logs */}
        {logsOpen ? (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              آخر السجلات
            </h4>
            {logsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التحميل…
              </div>
            ) : logsError ? (
              <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <span>تعذّر تحميل السجلات.</span>
                <Button variant="outline" size="sm" onClick={() => void loadLogs()}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : logs.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                لا توجد سجلات بعد لهذه الأتمتة.
              </p>
            ) : (
              <ul className="space-y-2">
                {logs.map((log) => {
                  const status = resolveLogStatus(log.status);
                  return (
                    <li
                      key={log.id}
                      className="flex flex-col gap-1 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge label={status.label} tone={status.tone} />
                        <span className="text-sm">{log.message ?? "—"}</span>
                      </div>
                      <time className="text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface ConfigFieldProps {
  automation: AutomationDto;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

/** Renders the single config control appropriate to the automation type. */
function ConfigField({
  automation,
  value,
  onChange,
  disabled,
}: ConfigFieldProps) {
  const fieldId = `automation-${automation.id}-config`;

  if (automation.type === "low_stock_alert") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>حد المخزون المنخفض</Label>
        <Input
          id={fieldId}
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="max-w-40"
        />
        <p className="text-xs text-muted-foreground">
          يتم التنبيه عندما يكون مخزون المنتج النشط عند هذا الرقم أو أقل.
        </p>
      </div>
    );
  }

  if (automation.type === "daily_sales_report") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>وقت إرسال التقرير</Label>
        <Input
          id={fieldId}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="max-w-40"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground">
          الوقت اليومي (24 ساعة) المُجدوَل لإنشاء التقرير.
        </p>
      </div>
    );
  }

  if (automation.type === "whatsapp_order_message") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>قالب الرسالة</Label>
        <Textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          maxLength={2000}
          placeholder="مرحباً {{customer_name}}…"
        />
        <p className="text-xs text-muted-foreground">
          المتغيّرات المتاحة: {"{{customer_name}}"}، {"{{order_number}}"}،{" "}
          {"{{order_total}}"}.
        </p>
      </div>
    );
  }

  return null;
}
