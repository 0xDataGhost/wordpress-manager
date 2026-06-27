import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveOrderStatus } from "@/components/orders/order-status";
import {
  DIGITAL_DELIVERY_STATUS_OPTIONS,
  resolveDigitalDeliveryStatus,
} from "@/components/digital-delivery/digital-delivery-status";
import {
  getQueue,
  type DigitalDeliveryStatus,
  type QueueItem,
} from "@/lib/digital-delivery-api";
import { formatDateTime } from "@/lib/utils";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PAGE_SIZE = 20;

export function DigitalDeliveryQueuePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canView = hasPermission("digital_delivery.view");

  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DigitalDeliveryStatus | "">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getQueue({
        status: status || undefined,
        search: debouncedSearch.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.pagination.total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status, debouncedSearch, page]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  // Reset to the first page when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <PageHeader
          title="تسليم الأكواد"
          description="إدارة تعيين وتسليم الأكواد الرقمية للطلبات."
        />
        <EmptyState
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض تسليم الأكواد» لرؤية هذه الصفحة."
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<QueueItem>[] = [
    {
      key: "orderNumber",
      header: "رقم الطلب",
      cell: (row) => (
        <span dir="ltr" className="font-medium">
          {row.orderNumber ?? row.orderId.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "customer",
      header: "العميل",
      cell: (row) => <span>{row.customerName ?? "—"}</span>,
    },
    {
      key: "orderStatus",
      header: "حالة الطلب",
      cell: (row) => {
        const meta = resolveOrderStatus(row.orderStatus);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "digitalStatus",
      header: "حالة التسليم",
      cell: (row) => {
        const meta = resolveDigitalDeliveryStatus(row.digitalDeliveryStatus);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "codes",
      header: "الأكواد (معيَّن/مطلوب)",
      cell: (row) => (
        <span dir="ltr">
          {row.assignedCodes} / {row.requiredCodes}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "تاريخ الطلب",
      cell: (row) => (
        <span className="text-sm">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-24",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/digital-delivery/orders/${row.orderId}`)}
        >
          فتح الطلب
        </Button>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="تسليم الأكواد"
        description="الطلبات التي تحتاج تعيين أو تسليم أكواد رقمية."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RotateCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث برقم الطلب أو اسم العميل…"
          className="sm:max-w-xs"
        />
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as DigitalDeliveryStatus | "")}
          aria-label="تصفية حسب حالة التسليم"
        >
          <option value="">كل الحالات</option>
          {DIGITAL_DELIVERY_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.orderId}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا توجد طلبات رقمية"
        emptyDescription="لا توجد طلبات تحتاج تعيين أو تسليم أكواد حالياً."
      />

      {!loading && !error && total > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} — {total} طلب
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              التالي
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
