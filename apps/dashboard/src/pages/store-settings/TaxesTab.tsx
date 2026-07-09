import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import {
  createTaxRate,
  deleteTaxRate,
  listTaxRates,
  updateTaxRate,
  type TaxRate,
  type TaxRateInput,
} from "@/lib/store-config-api";
import { SettingsGroupForm } from "./SettingsGroupForm";
import { TAX_FIELDS } from "./settings-fields";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** The three WooCommerce tax classes we let the operator pick from. */
const TAX_CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: "standard", label: "قياسية" },
  { value: "reduced-rate", label: "مخفّضة" },
  { value: "zero-rate", label: "صفرية" },
];

const TAX_CLASS_LABELS: Record<string, string> = {
  standard: "قياسية",
  "reduced-rate": "مخفّضة",
  "zero-rate": "صفرية",
  "": "قياسية",
};

function taxClassLabel(taxClass: string): string {
  return TAX_CLASS_LABELS[taxClass] ?? taxClass;
}

/** Country + state as a single LTR cell, or an em dash when both are empty. */
function locationLabel(rate: TaxRate): string {
  const parts = [rate.country, rate.state].filter((part) => part.trim() !== "");
  return parts.length > 0 ? parts.join(" / ") : "—";
}

interface TaxesTabProps {
  canManage: boolean;
}

export function TaxesTab({ canManage }: TaxesTabProps) {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [rateDialog, setRateDialog] = useState<{
    open: boolean;
    rate: TaxRate | null;
  }>({ open: false, rate: null });
  const [deleteTarget, setDeleteTarget] = useState<TaxRate | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listTaxRates();
      setRates(result.data.rates);
      setFetchedAt(result.fetchedAt);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteTaxRate(deleteTarget.rateId);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر حذف معدّل الضريبة.",
      );
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<TaxRate>[] = [
    {
      key: "name",
      header: "الاسم",
      cell: (row) => <span className="font-medium">{row.name || "—"}</span>,
    },
    {
      key: "location",
      header: "الدولة/المنطقة",
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {locationLabel(row)}
        </span>
      ),
    },
    {
      key: "rate",
      header: "النسبة",
      cell: (row) => (
        <span dir="ltr" className="text-sm">
          {row.rate}%
        </span>
      ),
    },
    {
      key: "taxClass",
      header: "الفئة",
      cell: (row) => <span className="text-sm">{taxClassLabel(row.taxClass)}</span>,
    },
    {
      key: "priority",
      header: "الأولوية",
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {row.priority}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-32",
            cell: (row: TaxRate) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="تعديل"
                  onClick={() => {
                    setActionError(null);
                    setRateDialog({ open: true, rate: row });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  onClick={() => {
                    setActionError(null);
                    setDeleteTarget(row);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ),
          } satisfies Column<TaxRate>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <SettingsGroupForm
        group="tax"
        fields={TAX_FIELDS}
        canManage={canManage}
        title="إعدادات الضرائب"
        description="احتساب وعرض الضرائب"
      />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>معدّلات الضريبة</CardTitle>
            <p className="text-xs text-muted-foreground">
              آخر تحديث: {formatDateTime(fetchedAt)}
            </p>
          </div>
          {canManage ? (
            <Button
              onClick={() => {
                setActionError(null);
                setRateDialog({ open: true, rate: null });
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة معدّل ضريبة
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            data={rates}
            rowKey={(row) => row.rateId}
            isLoading={loading}
            isError={error}
            onRetry={() => void load()}
            emptyTitle="لا توجد معدّلات ضريبة بعد"
            emptyDescription="أضف معدّل ضريبة لتطبيقه على طلبات المتجر."
          />
        </CardContent>
      </Card>

      <TaxRateDialog
        open={rateDialog.open}
        rate={rateDialog.rate}
        onOpenChange={(open) =>
          setRateDialog((prev) => ({ open, rate: open ? prev.rate : null }))
        }
        onSaved={() => {
          setRateDialog({ open: false, rate: null });
          void load();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="حذف معدّل الضريبة"
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name || locationLabel(deleteTarget)}». لا يمكن التراجع.`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        loading={busy}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

interface RateFormState {
  name: string;
  rate: string;
  country: string;
  state: string;
  taxClass: string;
  priority: string;
  compound: boolean;
  shipping: boolean;
}

const EMPTY_RATE: RateFormState = {
  name: "",
  rate: "",
  country: "",
  state: "",
  taxClass: "standard",
  priority: "1",
  compound: false,
  shipping: true,
};

function TaxRateDialog({
  open,
  rate,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  rate: TaxRate | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = rate !== null;
  const [form, setForm] = useState<RateFormState>(EMPTY_RATE);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    setForm(
      rate
        ? {
            name: rate.name,
            rate: rate.rate,
            country: rate.country,
            state: rate.state,
            taxClass: rate.taxClass || "standard",
            priority: String(rate.priority),
            compound: rate.compound,
            shipping: rate.shipping,
          }
        : EMPTY_RATE,
    );
  }, [open, rate]);

  function set<K extends keyof RateFormState>(key: K, value: RateFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const rateValue = Number(form.rate);
  const rateInvalid =
    form.rate.trim() === "" || Number.isNaN(rateValue) || rateValue < 0;

  const handleSubmit = async () => {
    if (rateInvalid) {
      setErrorMessage("النسبة مطلوبة ويجب أن تكون رقماً أكبر من أو يساوي صفر.");
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    const priorityValue = Number(form.priority);
    const payload: TaxRateInput = {
      name: form.name.trim(),
      rate: form.rate.trim(),
      country: form.country.trim() || undefined,
      state: form.state.trim() || undefined,
      taxClass: form.taxClass,
      priority: Number.isNaN(priorityValue) ? undefined : priorityValue,
      compound: form.compound,
      shipping: form.shipping,
    };
    try {
      if (isEdit && rate) {
        await updateTaxRate(rate.rateId, payload);
      } else {
        await createTaxRate(payload);
      }
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "تعذّر حفظ معدّل الضريبة.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "تعديل معدّل الضريبة" : "إضافة معدّل ضريبة"}
          </DialogTitle>
          <DialogDescription>
            بيانات معدّل الضريبة كما ستُطبَّق في متجر ووردبريس.
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tax-name">الاسم</Label>
            <Input
              id="tax-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="مثال: ضريبة القيمة المضافة"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-rate">النسبة (%)</Label>
            <Input
              id="tax-rate"
              type="number"
              min={0}
              step="0.0001"
              dir="ltr"
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-priority">الأولوية</Label>
            <Input
              id="tax-priority"
              type="number"
              min={1}
              step="1"
              dir="ltr"
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-country">الدولة</Label>
            <Input
              id="tax-country"
              dir="ltr"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="SA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-state">المنطقة</Label>
            <Input
              id="tax-state"
              dir="ltr"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tax-class">الفئة</Label>
            <select
              id="tax-class"
              className={selectClass}
              value={form.taxClass}
              onChange={(e) => set("taxClass", e.target.value)}
            >
              {TAX_CLASS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <Label htmlFor="tax-compound" className="cursor-pointer">
              ضريبة مركّبة
            </Label>
            <Switch
              id="tax-compound"
              checked={form.compound}
              onCheckedChange={(v) => set("compound", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <Label htmlFor="tax-shipping" className="cursor-pointer">
              تُطبَّق على الشحن
            </Label>
            <Switch
              id="tax-shipping"
              checked={form.shipping}
              onCheckedChange={(v) => set("shipping", v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || rateInvalid}
          >
            {saving ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إضافة"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
