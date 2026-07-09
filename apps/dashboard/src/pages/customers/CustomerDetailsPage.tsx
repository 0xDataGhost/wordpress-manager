import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Save,
  ShoppingBag,
  Wallet,
  CalendarPlus,
  CalendarClock,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatsCard } from "@/components/shared/StatsCard";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveOrderStatus } from "@/components/orders/order-status";
import { CustomerEditDialog } from "@/components/customers/CustomerEditDialog";
import {
  getCustomer,
  updateCustomerNotes,
  type CustomerAddressDto,
  type CustomerDetailsDto,
  type CustomerOrderDto,
} from "@/lib/customers-api";
import { formatDateTime, formatMoney } from "@/lib/utils";

type Banner = { tone: "success" | "error"; message: string };

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

/** Address rows to render, in order, with LTR-aligned technical fields. */
const ADDRESS_ROWS: readonly {
  key: keyof CustomerAddressDto;
  label: string;
  ltr?: boolean;
}[] = [
  { key: "firstName", label: "الاسم الأول" },
  { key: "lastName", label: "اسم العائلة" },
  { key: "company", label: "الشركة" },
  { key: "address1", label: "العنوان" },
  { key: "address2", label: "تفاصيل إضافية" },
  { key: "city", label: "المدينة" },
  { key: "state", label: "المنطقة" },
  { key: "postcode", label: "الرمز البريدي", ltr: true },
  { key: "country", label: "الدولة", ltr: true },
  { key: "phone", label: "الهاتف", ltr: true },
  { key: "email", label: "البريد الإلكتروني", ltr: true },
];

/** Read-only card rendering only the address fields that are present. */
function AddressCard({
  title,
  address,
}: {
  title: string;
  address: CustomerAddressDto;
}) {
  const rows = ADDRESS_ROWS.filter((row) => {
    const value = address[row.key];
    return typeof value === "string" && value.trim() !== "";
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">لا توجد تفاصيل.</p>
        ) : (
          rows.map((row) => (
            <DetailRow key={row.key} label={row.label}>
              {row.ltr ? (
                <span dir="ltr">{address[row.key]}</span>
              ) : (
                address[row.key]
              )}
            </DetailRow>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("customers.edit");
  const canManage = hasPermission("customers.manage");

  const [customer, setCustomer] = useState<CustomerDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const result = await getCustomer(id);
      setCustomer(result);
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
      const updated = await updateCustomerNotes(
        id,
        trimmed === "" ? null : trimmed,
      );
      setCustomer(updated);
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

  const orderColumns: Column<CustomerOrderDto>[] = [
    {
      key: "orderNumber",
      header: "رقم الطلب",
      cell: (row) => (
        <span dir="ltr" className="font-medium">
          {row.orderNumber || (row.wpOrderId ? `#${row.wpOrderId}` : "—")}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const meta = resolveOrderStatus(row.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "total",
      header: "الإجمالي",
      cell: (row) => (
        <span dir="ltr">{formatMoney(row.total, row.currency)}</span>
      ),
    },
    {
      key: "orderDate",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(row.orderDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={customer?.name || "تفاصيل العميل"}
        description="عرض ملف العميل ومقاييس الشراء وآخر الطلبات وإضافة ملاحظات داخلية."
        actions={
          <div className="flex items-center gap-2">
            {canManage && customer ? (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                تعديل بيانات العميل
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => navigate("/customers")}>
              <ArrowRight className="h-4 w-4" />
              رجوع إلى العملاء
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error || !customer ? (
        <ErrorState
          description="تعذّر تحميل بيانات العميل. يرجى المحاولة مرة أخرى."
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
                  : "rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              }
            >
              {banner.message}
            </div>
          ) : null}

          {/* Summary metric tiles (computed from synced orders). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="إجمالي الطلبات"
              value={customer.metrics.totalOrders}
              icon={ShoppingBag}
            />
            <StatsCard
              title="إجمالي الإنفاق"
              value={formatMoney(customer.metrics.totalSpent)}
              icon={Wallet}
            />
            <StatsCard
              title="أول طلب"
              value={formatDateTime(customer.metrics.firstOrderAt)}
              icon={CalendarPlus}
            />
            <StatsCard
              title="آخر طلب"
              value={formatDateTime(customer.metrics.lastOrderAt)}
              icon={CalendarClock}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>ملف العميل</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DetailRow label="الاسم">{customer.name || "—"}</DetailRow>
              <DetailRow label="البريد الإلكتروني">
                {customer.email ? (
                  <span dir="ltr">{customer.email}</span>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="الهاتف">
                {customer.phone ? <span dir="ltr">{customer.phone}</span> : "—"}
              </DetailRow>
              <DetailRow label="معرّف ووكومرس">
                {customer.wpCustomerId ? (
                  <span dir="ltr">#{customer.wpCustomerId}</span>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="تاريخ الإضافة">
                {formatDateTime(customer.createdAt)}
              </DetailRow>
            </CardContent>
          </Card>

          {customer.billing || customer.shipping ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {customer.billing ? (
                <AddressCard title="عنوان الفوترة" address={customer.billing} />
              ) : null}
              {customer.shipping ? (
                <AddressCard title="عنوان الشحن" address={customer.shipping} />
              ) : null}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>آخر الطلبات</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DataTable
                columns={orderColumns}
                data={customer.recentOrders}
                rowKey={(row) => row.id}
                emptyTitle="لا توجد طلبات"
                emptyDescription="لا يوجد لهذا العميل أي طلبات مُزامنة بعد."
                onRowClick={(row) => navigate(`/orders/${row.id}`)}
              />
            </CardContent>
          </Card>

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
                    ? "اكتب ملاحظة داخلية حول هذا العميل…"
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
                  العرض فقط — تحتاج صلاحية «تعديل العملاء» لحفظ الملاحظات.
                </p>
              )}
            </CardContent>
          </Card>

          {canManage ? (
            <CustomerEditDialog
              open={editOpen}
              customer={customer}
              onOpenChange={setEditOpen}
              onSaved={(updated) => {
                setCustomer((prev) =>
                  prev
                    ? {
                        ...prev,
                        name: updated.name,
                        phone: updated.phone,
                        billing: updated.billing,
                        shipping: updated.shipping,
                      }
                    : prev,
                );
                setBanner({
                  tone: "success",
                  message: "تم تحديث بيانات العميل.",
                });
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
