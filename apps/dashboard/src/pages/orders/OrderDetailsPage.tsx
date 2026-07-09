import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ORDER_STATUS_OPTIONS,
  resolveOrderStatus,
} from "@/components/orders/order-status";
import { OrderWpNotesCard } from "@/components/orders/OrderWpNotesCard";
import { OrderRefundsCard } from "@/components/orders/OrderRefundsCard";
import { OrderDigitalSection } from "@/components/digital-delivery/OrderDigitalSection";
import { ApiError } from "@/lib/http";
import {
  getOrder,
  updateOrderNotes,
  updateOrderStatus,
  type OrderDetailsDto,
  type OrderDto,
  type OrderItemDto,
  type OrderStatus,
} from "@/lib/orders-api";
import { formatDateTime, formatMoney } from "@/lib/utils";

type Banner = {
  tone: "success" | "error";
  message: string;
  /** Offer a reload action (WordPress-conflict recovery). */
  refresh?: boolean;
};

const selectClass =
  "flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

export function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("orders.edit");
  const canViewDigital = hasPermission("digital_delivery.view");
  const canManageStatus = hasPermission("orders.manage_status");

  const [order, setOrder] = useState<OrderDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const result = await getOrder(id);
      setOrder(result);
      setNotes(result.internalNotes ?? "");
      setSavedNotes(result.internalNotes ?? "");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = notes !== savedNotes;

  async function handleSaveNotes() {
    if (!id) return;
    setSaving(true);
    setBanner(null);
    try {
      const trimmed = notes.trim();
      const updated = await updateOrderNotes(id, trimmed === "" ? null : trimmed);
      setOrder(updated);
      setNotes(updated.internalNotes ?? "");
      setSavedNotes(updated.internalNotes ?? "");
      setBanner({ tone: "success", message: "تم حفظ الملاحظات الداخلية." });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "تعذّر حفظ الملاحظات.",
      });
    } finally {
      setSaving(false);
    }
  }

  /** Merge a fresh order mirror into local state, keeping the loaded items. */
  const applyOrderUpdate = useCallback((updated: OrderDto) => {
    setOrder((prev) =>
      prev ? { ...prev, ...updated, items: prev.items } : prev,
    );
  }, []);

  async function handleConfirmStatusChange() {
    if (!id || !pendingStatus) return;
    setChangingStatus(true);
    setBanner(null);
    try {
      const updated = await updateOrderStatus(id, pendingStatus);
      applyOrderUpdate(updated);
      setPendingStatus(null);
      setBanner({
        tone: "success",
        message: `تم تغيير حالة الطلب إلى «${resolveOrderStatus(updated.status).label}».`,
      });
    } catch (err) {
      setPendingStatus(null);
      if (err instanceof ApiError && err.status === 409) {
        setBanner({
          tone: "error",
          message: "تم تعديل الطلب في ووردبريس — حدّث الصفحة وحاول مجدداً.",
          refresh: true,
        });
      } else {
        setBanner({
          tone: "error",
          message:
            err instanceof Error ? err.message : "تعذّر تغيير حالة الطلب.",
        });
      }
    } finally {
      setChangingStatus(false);
    }
  }

  const itemColumns: Column<OrderItemDto>[] = [
    {
      key: "name",
      header: "المنتج",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name || "—"}</span>
          {row.sku ? (
            <span dir="ltr" className="text-xs text-muted-foreground">
              {row.sku}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "الكمية",
      cell: (row) => <span>{row.quantity}</span>,
    },
    {
      key: "price",
      header: "السعر",
      cell: (row) => (
        <span dir="ltr">{formatMoney(row.price, order?.currency)}</span>
      ),
    },
    {
      key: "total",
      header: "الإجمالي",
      cell: (row) => (
        <span dir="ltr">{formatMoney(row.total, order?.currency)}</span>
      ),
    },
  ];

  const orderTitle = order
    ? order.orderNumber ||
      (order.wpOrderId ? `#${order.wpOrderId}` : "تفاصيل الطلب")
    : "تفاصيل الطلب";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`الطلب ${orderTitle}`}
        description="عرض تفاصيل الطلب والعميل والمنتجات وإضافة ملاحظات داخلية."
        actions={
          <Button variant="outline" onClick={() => navigate("/orders")}>
            <ArrowRight className="h-4 w-4" />
            رجوع إلى الطلبات
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error || !order ? (
        <ErrorState
          description="تعذّر تحميل الطلب. يرجى المحاولة مرة أخرى."
          onRetry={() => void load()}
        />
      ) : (
        <div className="space-y-4">
          {banner ? (
            <div
              role="alert"
              className={
                banner.tone === "success"
                  ? "rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
                  : "flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              }
            >
              {banner.message}
              {banner.refresh ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBanner(null);
                    void load();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  تحديث الصفحة
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>ملخص الطلب</CardTitle>
                {canManageStatus && order.wpOrderId !== null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const meta = resolveOrderStatus(order.status);
                      return (
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      );
                    })()}
                    <select
                      className={selectClass}
                      value={order.status}
                      onChange={(e) => {
                        const next = e.target.value as OrderStatus;
                        if (next !== order.status) setPendingStatus(next);
                      }}
                      disabled={changingStatus}
                      aria-label="تغيير حالة الطلب"
                    >
                      {ORDER_STATUS_OPTIONS.every(
                        (option) => option.value !== order.status,
                      ) ? (
                        <option value={order.status} disabled>
                          {resolveOrderStatus(order.status).label}
                        </option>
                      ) : null}
                      {ORDER_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="pt-0">
                <DetailRow label="رقم الطلب">
                  <span dir="ltr">{orderTitle}</span>
                </DetailRow>
                <DetailRow label="الحالة">
                  {(() => {
                    const meta = resolveOrderStatus(order.status);
                    return <StatusBadge label={meta.label} tone={meta.tone} />;
                  })()}
                </DetailRow>
                <DetailRow label="الإجمالي">
                  <span dir="ltr">
                    {formatMoney(order.total, order.currency)}
                  </span>
                </DetailRow>
                {Number(order.totalRefunded) > 0 ? (
                  <DetailRow label="المبلغ المسترد">
                    <span dir="ltr">
                      {formatMoney(order.totalRefunded, order.currency)}
                    </span>
                  </DetailRow>
                ) : null}
                <DetailRow label="العملة">
                  <span dir="ltr">{order.currency}</span>
                </DetailRow>
                <DetailRow label="طريقة الدفع">
                  {order.paymentMethod || "—"}
                </DetailRow>
                <DetailRow label="تاريخ الطلب">
                  {formatDateTime(order.placedAt ?? order.createdAt)}
                </DetailRow>
                <DetailRow label="معرّف ووكومرس">
                  {order.wpOrderId ? (
                    <span dir="ltr">#{order.wpOrderId}</span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label="آخر مزامنة">
                  {formatDateTime(order.lastSyncedAt)}
                </DetailRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>بيانات العميل</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {order.customer ? (
                  <>
                    <DetailRow label="الاسم">
                      {order.customer.name || "—"}
                    </DetailRow>
                    <DetailRow label="البريد الإلكتروني">
                      {order.customer.email ? (
                        <span dir="ltr">{order.customer.email}</span>
                      ) : (
                        "—"
                      )}
                    </DetailRow>
                    <DetailRow label="الهاتف">
                      {order.customer.phone ? (
                        <span dir="ltr">{order.customer.phone}</span>
                      ) : (
                        "—"
                      )}
                    </DetailRow>
                    <DetailRow label="إجمالي الإنفاق">
                      <span dir="ltr">
                        {formatMoney(
                          order.customer.totalSpent,
                          order.currency,
                        )}
                      </span>
                    </DetailRow>
                    <DetailRow label="عدد الطلبات">
                      {order.customer.ordersCount}
                    </DetailRow>
                    <DetailRow label="آخر طلب">
                      {formatDateTime(order.customer.lastOrderAt)}
                    </DetailRow>
                  </>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    طلب زائر — لا توجد بيانات عميل مرتبطة.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>منتجات الطلب</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DataTable
                columns={itemColumns}
                data={order.items}
                rowKey={(row) => row.id}
                emptyTitle="لا توجد منتجات"
                emptyDescription="لا تحتوي بيانات هذا الطلب على عناصر."
              />
            </CardContent>
          </Card>

          {canViewDigital ? (
            <OrderDigitalSection orderId={order.id} orderItems={order.items} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>ملاحظات داخلية</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-3 text-sm text-muted-foreground">
                ملاحظات خاصة بفريق المتجر فقط. لا تُرسل إلى ووكومرس ولا تظهر
                للعميل.
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  canEdit
                    ? "اكتب ملاحظة داخلية حول هذا الطلب…"
                    : "لا تملك صلاحية تعديل الملاحظات."
                }
                rows={5}
                maxLength={5000}
                disabled={!canEdit || saving}
                aria-label="ملاحظات داخلية"
              />
              {canEdit ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={() => void handleSaveNotes()}
                    disabled={saving || !dirty}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "جارٍ الحفظ…" : "حفظ الملاحظات"}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  العرض فقط — تحتاج صلاحية «تعديل الطلبات» لحفظ الملاحظات.
                </p>
              )}
            </CardContent>
          </Card>

          {order.wpOrderId !== null ? (
            <>
              <OrderWpNotesCard orderId={order.id} />
              <OrderRefundsCard
                orderId={order.id}
                orderTotal={order.total}
                totalRefunded={order.totalRefunded}
                currency={order.currency}
                onOrderUpdated={applyOrderUpdate}
              />
            </>
          ) : null}

          <ConfirmDialog
            open={pendingStatus !== null}
            onOpenChange={(open) => {
              if (!open && !changingStatus) setPendingStatus(null);
            }}
            title="تغيير حالة الطلب في ووردبريس؟"
            description={`سيتم تغيير الحالة إلى «${
              pendingStatus ? resolveOrderStatus(pendingStatus).label : ""
            }». سيتم تشغيل إجراءات ووكومرس المعتادة مثل رسائل البريد.`}
            confirmLabel={changingStatus ? "جارٍ التغيير…" : "تغيير الحالة"}
            loading={changingStatus}
            onConfirm={() => void handleConfirmStatusChange()}
          />
        </div>
      )}
    </div>
  );
}
