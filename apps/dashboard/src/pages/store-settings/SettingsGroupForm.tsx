import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import {
  getStoreSettings,
  updateStoreSettings,
  type SettingsGroup,
  type SettingValue,
} from "@/lib/store-config-api";
import {
  CURRENCY_KEY,
  checkedToWooBool,
  wooBoolToChecked,
  type FieldSpec,
} from "./settings-fields";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Local editable form state keyed by setting name. */
type FormState = Record<string, SettingValue>;

interface SettingsGroupFormProps {
  group: SettingsGroup;
  fields: FieldSpec[];
  canManage: boolean;
  title: string;
  description: string;
}

/** Normalize a loaded value into an editable form value for a field kind. */
function toFormValue(field: FieldSpec, raw: SettingValue | undefined): SettingValue {
  if (field.kind === "boolean") return wooBoolToChecked(raw);
  if (raw === undefined || raw === null) return "";
  return typeof raw === "boolean" ? (raw ? "yes" : "no") : raw;
}

/** Serialize a form value back to what the backend expects for a field kind. */
function toWireValue(field: FieldSpec, value: SettingValue): SettingValue {
  if (field.kind === "boolean") return checkedToWooBool(Boolean(value));
  return value;
}

export function SettingsGroupForm({
  group,
  fields,
  canManage,
  title,
  description,
}: SettingsGroupFormProps) {
  const [initial, setInitial] = useState<FormState>({});
  const [values, setValues] = useState<FormState>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmCurrency, setConfirmCurrency] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getStoreSettings(group);
      const seeded: FormState = {};
      for (const field of fields) {
        seeded[field.key] = toFormValue(field, result.data.values[field.key]);
      }
      setInitial(seeded);
      setValues(seeded);
      setFetchedAt(result.fetchedAt);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [group, fields]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: string, value: SettingValue) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  /** Keys whose value differs from what was loaded — only these are sent. */
  const changedKeys = fields
    .map((f) => f.key)
    .filter((key) => values[key] !== initial[key]);

  const currencyChanged = changedKeys.includes(CURRENCY_KEY);

  const persist = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload: FormState = {};
      for (const field of fields) {
        if (values[field.key] !== initial[field.key]) {
          payload[field.key] = toWireValue(field, values[field.key]);
        }
      }
      const result = await updateStoreSettings(group, payload);
      const seeded: FormState = {};
      for (const field of fields) {
        seeded[field.key] = toFormValue(field, result.data.values[field.key]);
      }
      setInitial(seeded);
      setValues(seeded);
      setFetchedAt(result.fetchedAt);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "تعذّر حفظ الإعدادات. حاول مرة أخرى.",
      );
    } finally {
      setSaving(false);
    }
  }, [fields, values, initial, group]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (changedKeys.length === 0) return;
    // A base-currency change is high-impact: require an explicit confirmation.
    if (currencyChanged) {
      setConfirmCurrency(true);
      return;
    }
    void persist();
  };

  if (loading) {
    return <LoadingState variant="skeleton" rows={4} />;
  }

  if (error) {
    return <ErrorState onRetry={() => void load()} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FetchedAtNote fetchedAt={fetchedAt} onRefresh={() => void load()} />

      {saveError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {saveError}
        </div>
      ) : null}

      {saved ? (
        <div
          role="status"
          className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          تم حفظ التغييرات بنجاح.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key]}
              disabled={!canManage}
              onChange={(next) => setField(field.key, next)}
            />
          ))}
        </CardContent>
      </Card>

      {currencyChanged ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>تغيير العملة الأساسية يؤثر على التسعير — يتطلب تأكيداً.</span>
        </div>
      ) : null}

      {canManage ? (
        <div className="flex items-center justify-end">
          <Button
            type="submit"
            disabled={saving || changedKeys.length === 0}
          >
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
          </Button>
        </div>
      ) : (
        <p className="text-end text-xs text-muted-foreground">
          العرض فقط — تحتاج صلاحية «إدارة إعدادات المتجر» لحفظ التغييرات.
        </p>
      )}

      <ConfirmDialog
        open={confirmCurrency}
        onOpenChange={setConfirmCurrency}
        title="تأكيد تغيير العملة الأساسية"
        description="تغيير العملة الأساسية يؤثر على تسعير المتجر بالكامل. هل تريد المتابعة؟"
        confirmLabel="نعم، غيّر العملة"
        loading={saving}
        onConfirm={() => {
          setConfirmCurrency(false);
          void persist();
        }}
      />
    </form>
  );
}

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  value: SettingValue;
  disabled: boolean;
  onChange: (value: SettingValue) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-1">
        <div className="space-y-0.5">
          <Label>{field.label}</Label>
          {field.hint ? (
            <p className="text-xs text-muted-foreground">{field.hint}</p>
          ) : null}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={field.label}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`sf-${field.key}`}>{field.label}</Label>
      {field.kind === "select" ? (
        <select
          id={`sf-${field.key}`}
          className={selectClass}
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`sf-${field.key}`}
          type={field.kind === "number" ? "number" : "text"}
          dir={field.ltr ? "ltr" : undefined}
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint ? (
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      ) : null}
    </div>
  );
}

/** Small "last synced from WordPress" indicator with a manual refresh. */
export function FetchedAtNote({
  fetchedAt,
  onRefresh,
}: {
  fetchedAt: string | null;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>آخر تحديث من ووردبريس: {formatDateTime(fetchedAt)}</span>
      {onRefresh ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      ) : null}
    </div>
  );
}
