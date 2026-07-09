import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import {
  listGateways,
  updateGateway,
  type PaymentGateway,
} from "@/lib/store-config-api";

interface GatewaysTabProps {
  canToggle: boolean;
}

export function GatewaysTab({ canToggle }: GatewaysTabProps) {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<PaymentGateway | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listGateways();
      setGateways(result.data.gateways);
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

  const handleToggle = async (gateway: PaymentGateway, enabled: boolean) => {
    setTogglingId(gateway.gatewayId);
    setActionError(null);
    try {
      await updateGateway(gateway.gatewayId, { enabled });
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر تحديث حالة البوابة.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const columns: Column<PaymentGateway>[] = [
    {
      key: "gateway",
      header: "البوابة",
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.title}</div>
          <div dir="ltr" className="text-xs text-muted-foreground">
            {row.method}
          </div>
        </div>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      cell: (row) => (
        <span className="block max-w-xs truncate text-sm text-muted-foreground">
          {row.description || "—"}
        </span>
      ),
    },
    {
      key: "supportsRefunds",
      header: "يدعم الاسترداد",
      cell: (row) => (
        <StatusBadge
          label={row.supportsRefunds ? "نعم" : "لا"}
          tone={row.supportsRefunds ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "enabled",
      header: "الحالة",
      cell: (row) => (
        <Switch
          checked={row.enabled}
          disabled={!canToggle || togglingId === row.gatewayId}
          onCheckedChange={(next) => void handleToggle(row, next)}
          aria-label={`تفعيل ${row.title}`}
        />
      ),
    },
    ...(canToggle
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-28",
            cell: (row: PaymentGateway) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setEditTarget(row);
                }}
              >
                <Pencil className="h-4 w-4" />
                تعديل
              </Button>
            ),
          } satisfies Column<PaymentGateway>,
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>بوابات الدفع</CardTitle>
        <p className="text-xs text-muted-foreground">
          آخر تحديث: {formatDateTime(fetchedAt)}
        </p>
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
          data={gateways}
          rowKey={(row) => row.gatewayId}
          isLoading={loading}
          isError={error}
          onRetry={() => void load()}
          emptyTitle="لا توجد بوابات دفع"
          emptyDescription="ستظهر بوابات الدفع المتاحة في المتجر هنا."
        />

        <GatewayEditDialog
          gateway={editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onSaved={() => {
            setEditTarget(null);
            void load();
          }}
        />
      </CardContent>
    </Card>
  );
}

function GatewayEditDialog({
  gateway,
  onOpenChange,
  onSaved,
}: {
  gateway: PaymentGateway | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!gateway) return;
    setTitle(gateway.title);
    setDescription(gateway.description);
    setErrorMessage(null);
  }, [gateway]);

  const handleSubmit = async () => {
    if (!gateway) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      // Only the display fields are editable — enabled is preserved as-is and
      // no credentials/secrets exist on this type to render or send.
      await updateGateway(gateway.gatewayId, {
        enabled: gateway.enabled,
        title: title.trim(),
        description: description.trim(),
      });
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "تعذّر حفظ بيانات البوابة.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={gateway !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بوابة الدفع</DialogTitle>
          <DialogDescription>
            {gateway
              ? `عدّل عنوان ووصف «${gateway.title}» كما يظهران للعملاء.`
              : ""}
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
          <div className="space-y-1.5">
            <Label htmlFor="gateway-title">العنوان</Label>
            <Input
              id="gateway-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gateway-description">الوصف</Label>
            <Textarea
              id="gateway-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ"}
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
