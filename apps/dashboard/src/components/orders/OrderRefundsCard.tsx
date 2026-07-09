import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  createOrderRefund,
  listOrderRefunds,
  type OrderDto,
  type OrderRefundDto,
} from "@/lib/orders-api";
import { formatDateTime, formatMoney } from "@/lib/utils";

interface OrderRefundsCardProps {
  orderId: string;
  /** Decimal strings from the order mirror (exact money). */
  orderTotal: string;
  totalRefunded: string;
  currency: string;
  /** Called with the fresh order after a refund (status/totalRefunded change). */
  onOrderUpdated: (order: OrderDto) => void;
}

/** Remaining refundable amount = total − totalRefunded, floored at zero. */
function remainingRefundable(total: string, refunded: string): number {
  const remaining = Number(total) - Number(refunded);
  if (Number.isNaN(remaining)) return 0;
  return Math.max(0, Math.round(remaining * 100) / 100);
}

/**
 * WooCommerce refunds (Phase 27): the mirror list plus a money-sensitive
 * create-refund dialog. The gateway toggle (real money movement) only renders
 * for holders of orders.refund_payment; everyone else creates record-only
 * refunds. 409/400 messages from the backend surface inside the dialog.
 */
export function OrderRefundsCard({
  orderId,
  orderTotal,
  totalRefunded,
  currency,
  onOrderUpdated,
}: OrderRefundsCardProps) {
  const { hasPermission } = useAuth();
  const canRefund = hasPermission("orders.refund");
  const canRefundPayment = hasPermission("orders.refund_payment");

  const [refunds, setRefunds] = useState<OrderRefundDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [restockItems, setRestockItems] = useState(false);
  const [refundPayment, setRefundPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Stable per-attempt idempotency key: generated once when the dialog opens so
  // a retry of the SAME refund (e.g. after a timeout) reuses it and the backend
  // never moves money twice (Phase 32 money-safety).
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const remaining = remainingRefundable(orderTotal, totalRefunded);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listOrderRefunds(orderId);
      setRefunds(result.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openDialog() {
    setAmount("");
    setReason("");
    setRestockItems(false);
    setRefundPayment(false);
    setDialogError(null);
    setSubmitting(false);
    setIdempotencyKey(crypto.randomUUID());
    setDialogOpen(true);
  }

  async function handleSubmit() {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setDialogError("أدخل مبلغاً صحيحاً أكبر من صفر.");
      return;
    }
    if (parsed > remaining) {
      setDialogError(
        `المبلغ يتجاوز المتاح للاسترداد (${formatMoney(remaining, currency)}).`,
      );
      return;
    }
    setSubmitting(true);
    setDialogError(null);
    try {
      const trimmedReason = reason.trim();
      const result = await createOrderRefund(orderId, {
        amount: parsed,
        reason: trimmedReason === "" ? undefined : trimmedReason,
        refundPayment: canRefundPayment ? refundPayment : false,
        restockItems,
        idempotencyKey,
      });
      setDialogOpen(false);
      onOrderUpdated(result.order);
      await load();
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "تعذّر إنشاء الاسترداد.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<OrderRefundDto>[] = [
    {
      key: "amount",
      header: "المبلغ",
      cell: (row) => (
        <span dir="ltr" className="font-medium">
          {formatMoney(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.reason || "—"}
        </span>
      ),
    },
    {
      key: "refundedPayment",
      header: "نوع الاسترداد",
      cell: (row) => (
        <StatusBadge
          label={
            row.refundedPayment ? "أُعيد المبلغ عبر البوابة" : "استرداد سجلّي"
          }
          tone={row.refundedPayment ? "warning" : "neutral"}
        />
      ),
    },
    {
      key: "initiatedBy",
      header: "المصدر",
      cell: (row) => (
        <StatusBadge
          label={row.initiatedBy === "saas" ? "من اللوحة" : "من ووردبريس"}
          tone={row.initiatedBy === "saas" ? "info" : "neutral"}
        />
      ),
    },
    {
      key: "date",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-sm">
          {formatDateTime(row.wpDateCreated ?? row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-primary" />
          الاستردادات
        </CardTitle>
        {canRefund ? (
          <Button
            variant="outline"
            onClick={openDialog}
            disabled={remaining <= 0}
          >
            <RotateCcw className="h-4 w-4" />
            إنشاء استرداد
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            description="تعذّر تحميل استردادات الطلب."
            onRetry={() => void load()}
          />
        ) : (
          <DataTable
            columns={columns}
            data={refunds}
            rowKey={(row) => row.id}
            emptyTitle="لا توجد استردادات"
            emptyDescription="لم يُسجَّل أي استرداد لهذا الطلب بعد."
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء استرداد</DialogTitle>
            <DialogDescription>
              يُنشأ الاسترداد في ووكومرس ويُخصم من إجمالي الطلب.
            </DialogDescription>
          </DialogHeader>

          {dialogError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {dialogError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="refund-amount">المبلغ</Label>
            <Input
              id="refund-amount"
              dir="ltr"
              type="number"
              inputMode="decimal"
              min={0}
              max={remaining}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              المتاح للاسترداد:{" "}
              <span dir="ltr">{formatMoney(remaining, currency)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-reason">السبب (اختياري)</Label>
            <Textarea
              id="refund-reason"
              rows={3}
              maxLength={500}
              placeholder="مثال: إلغاء بطلب من العميل"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="refund-restock"
              checked={restockItems}
              onCheckedChange={setRestockItems}
              disabled={submitting}
            />
            <Label htmlFor="refund-restock">إرجاع للمخزون</Label>
          </div>

          {canRefundPayment ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="refund-payment"
                  checked={refundPayment}
                  onCheckedChange={setRefundPayment}
                  disabled={submitting}
                />
                <Label htmlFor="refund-payment">
                  إعادة المبلغ عبر بوابة الدفع
                </Label>
              </div>
              {refundPayment ? (
                <p className="text-xs font-medium text-destructive">
                  سيتم تحويل مبلغ حقيقي عبر بوابة الدفع.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant={refundPayment ? "destructive" : "default"}
              onClick={() => void handleSubmit()}
              disabled={submitting || !amount}
            >
              {submitting ? "جارٍ الإنشاء…" : "إنشاء الاسترداد"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
