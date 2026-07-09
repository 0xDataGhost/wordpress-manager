import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Trash2, Truck } from "lucide-react";
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
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FetchedAtNote } from "./SettingsGroupForm";
import {
  SHIPPING_METHOD_VALUES,
  addShippingMethod,
  createShippingZone,
  deleteShippingMethod,
  deleteShippingZone,
  listShippingZones,
  updateShippingZone,
  type ShippingMethod,
  type ShippingMethodId,
  type ShippingZone,
} from "@/lib/store-config-api";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const METHOD_LABELS: Record<string, string> = {
  flat_rate: "سعر ثابت",
  free_shipping: "شحن مجاني",
  local_pickup: "استلام محلي",
};

function methodLabel(methodId: string): string {
  return METHOD_LABELS[methodId] ?? methodId;
}

interface ShippingTabProps {
  canManage: boolean;
}

export function ShippingTab({ canManage }: ShippingTabProps) {
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [zoneDialog, setZoneDialog] = useState<{
    open: boolean;
    zone: ShippingZone | null;
  }>({ open: false, zone: null });
  const [methodDialogZone, setMethodDialogZone] = useState<ShippingZone | null>(
    null,
  );
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<ShippingZone | null>(
    null,
  );
  const [deleteMethodTarget, setDeleteMethodTarget] = useState<{
    zone: ShippingZone;
    method: ShippingMethod;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listShippingZones();
      setZones(result.data.zones);
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

  const handleDeleteZone = async () => {
    if (!deleteZoneTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteShippingZone(deleteZoneTarget.zoneId);
      setDeleteZoneTarget(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر حذف منطقة الشحن.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMethod = async () => {
    if (!deleteMethodTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteShippingMethod(
        deleteMethodTarget.zone.zoneId,
        deleteMethodTarget.method.instanceId,
      );
      setDeleteMethodTarget(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر حذف طريقة الشحن.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" rows={4} />;
  }

  if (error) {
    return <ErrorState onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <FetchedAtNote fetchedAt={fetchedAt} onRefresh={() => void load()} />
        {canManage ? (
          <Button onClick={() => setZoneDialog({ open: true, zone: null })}>
            <Plus className="h-4 w-4" />
            منطقة جديدة
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      {zones.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="لا توجد مناطق شحن بعد"
          description="أنشئ منطقة شحن لتحديد الوجهات وطرق الشحن المتاحة لها."
        />
      ) : (
        <div className="space-y-4">
          {zones.map((zone) => (
            <Card key={zone.zoneId}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {zone.name}
                  </CardTitle>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {zone.locations.length} موقع · {zone.methods.length} طريقة
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="تعديل المنطقة"
                      onClick={() => setZoneDialog({ open: true, zone })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف المنطقة"
                      onClick={() => {
                        setActionError(null);
                        setDeleteZoneTarget(zone);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
                {zone.methods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    لا توجد طرق شحن في هذه المنطقة.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {zone.methods.map((method) => (
                      <li
                        key={method.instanceId}
                        className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {method.title || methodLabel(method.methodId)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {methodLabel(method.methodId)}
                          </span>
                          <StatusBadge
                            label={method.enabled ? "مُفعّل" : "معطّل"}
                            tone={method.enabled ? "success" : "neutral"}
                          />
                        </div>
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="حذف الطريقة"
                            onClick={() => {
                              setActionError(null);
                              setDeleteMethodTarget({ zone, method });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setMethodDialogZone(zone);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    إضافة طريقة شحن
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ZoneDialog
        open={zoneDialog.open}
        zone={zoneDialog.zone}
        onOpenChange={(open) =>
          setZoneDialog((prev) => ({ open, zone: open ? prev.zone : null }))
        }
        onSaved={() => {
          setZoneDialog({ open: false, zone: null });
          void load();
        }}
      />

      <MethodDialog
        zone={methodDialogZone}
        onOpenChange={(open) => {
          if (!open) setMethodDialogZone(null);
        }}
        onSaved={() => {
          setMethodDialogZone(null);
          void load();
        }}
      />

      <ConfirmDialog
        open={deleteZoneTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteZoneTarget(null);
        }}
        title="حذف منطقة الشحن"
        description={
          deleteZoneTarget
            ? `سيتم حذف «${deleteZoneTarget.name}» وطرق الشحن الخاصة بها. لا يمكن التراجع.`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        loading={busy}
        onConfirm={() => void handleDeleteZone()}
      />

      <ConfirmDialog
        open={deleteMethodTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteMethodTarget(null);
        }}
        title="حذف طريقة الشحن"
        description={
          deleteMethodTarget
            ? `سيتم حذف «${
                deleteMethodTarget.method.title ||
                methodLabel(deleteMethodTarget.method.methodId)
              }» من المنطقة.`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        loading={busy}
        onConfirm={() => void handleDeleteMethod()}
      />
    </div>
  );
}

function ZoneDialog({
  open,
  zone,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  zone: ShippingZone | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = zone !== null;
  const [name, setName] = useState("");
  const [order, setOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? "");
    setOrder(zone != null ? String(zone.order) : "0");
    setErrorMessage(null);
  }, [open, zone]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const payload = { name: trimmed, order: Number(order) || 0 };
      if (isEdit && zone) {
        await updateShippingZone(zone.zoneId, payload);
      } else {
        await createShippingZone(payload);
      }
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "تعذّر حفظ منطقة الشحن.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "تعديل منطقة الشحن" : "منطقة شحن جديدة"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "عدّل اسم المنطقة وترتيبها ثم احفظ."
              : "أدخل اسم المنطقة وترتيبها."}
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="zone-name">اسم المنطقة</Label>
            <Input
              id="zone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: منطقة الخليج"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone-order">الترتيب</Label>
            <Input
              id="zone-order"
              type="number"
              dir="ltr"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={saving || name.trim().length === 0}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
          <Button
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

function MethodDialog({
  zone,
  onOpenChange,
  onSaved,
}: {
  zone: ShippingZone | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [methodId, setMethodId] = useState<ShippingMethodId>("flat_rate");
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!zone) return;
    setMethodId("flat_rate");
    setTitle("");
    setEnabled(true);
    setErrorMessage(null);
  }, [zone]);

  const handleSubmit = async () => {
    if (!zone) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await addShippingMethod(zone.zoneId, {
        methodId,
        title: title.trim() || undefined,
        enabled,
      });
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "تعذّر إضافة طريقة الشحن.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={zone !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة طريقة شحن</DialogTitle>
          <DialogDescription>
            {zone ? `أضف طريقة شحن إلى «${zone.name}».` : ""}
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="method-type">نوع الطريقة</Label>
            <select
              id="method-type"
              className={selectClass}
              value={methodId}
              onChange={(e) => setMethodId(e.target.value as ShippingMethodId)}
            >
              {SHIPPING_METHOD_VALUES.map((value) => (
                <option key={value} value={value}>
                  {methodLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="method-title">العنوان (اختياري)</Label>
            <Input
              id="method-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={methodLabel(methodId)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label htmlFor="method-enabled">مُفعّل</Label>
            <Switch
              id="method-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="تفعيل الطريقة"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "جارٍ الحفظ…" : "إضافة"}
          </Button>
          <Button
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
