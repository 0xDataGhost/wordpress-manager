import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveBatchStatus } from "@/components/digital-inventory/digital-code-status";
import {
  listBatches,
  type Batch,
  type Pagination,
} from "@/lib/digital-inventory-api";
import { listSuppliers, type SupplierListItem } from "@/lib/suppliers-api";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatCost(batch: Batch): string {
  if (!batch.costTotal) return "—";
  return `${batch.costTotal} ${batch.currency ?? ""}`.trim();
}

export function DigitalBatchesPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("digital_inventory.view");
  const canViewSuppliers = hasPermission("digital_suppliers.view");

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Batch[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);

  // Suppliers (best-effort, gated) resolve the supplier-id column to a name.
  useEffect(() => {
    if (!canView || !canViewSuppliers) return;
    listSuppliers({ limit: 100 })
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
  }, [canView, canViewSuppliers]);

  const supplierName = (id: string | null): string | null =>
    id ? (suppliers.find((s) => s.id === id)?.name ?? null) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listBatches({ page, limit: PAGE_SIZE });
      setItems(result.items);
      setPagination(result.pagination);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const columns: Column<Batch>[] = [
    {
      key: "batchName",
      header: "اسم الدفعة",
      cell: (row) => (
        <span className="font-medium">
          {row.batchName ?? `دفعة ${row.id.slice(0, 8)}`}
        </span>
      ),
    },
    {
      key: "productName",
      header: "المنتج",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.productName ?? "—"}
        </span>
      ),
    },
    // Supplier name (gated by digital_suppliers.view) resolved from the list above.
    ...(canViewSuppliers
      ? ([
          {
            key: "supplier",
            header: "المورد",
            cell: (row) => (
              <span className="text-sm text-muted-foreground">
                {supplierName(row.supplierId) ?? "—"}
              </span>
            ),
          },
        ] as Column<Batch>[])
      : []),
    {
      key: "quantityTotal",
      header: "إجمالي الأكواد",
      cell: (row) => row.quantityTotal,
    },
    {
      key: "quantityAvailable",
      header: "المتاح",
      cell: (row) => row.quantityAvailable,
    },
    {
      key: "quantitySold",
      header: "المباع",
      cell: (row) => row.quantitySold,
    },
    {
      key: "quantityDelivered",
      header: "المُسلَّم",
      cell: (row) => row.quantityDelivered,
    },
    {
      key: "cost",
      header: "التكلفة",
      cell: (row) => <span dir="ltr">{formatCost(row)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => (
        <StatusBadge
          label={resolveBatchStatus(row.status).label}
          tone={resolveBatchStatus(row.status).tone}
        />
      ),
    },
    {
      key: "createdAt",
      header: "تاريخ الإضافة",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="دفعات الأكواد"
        description="الدفعات المستوردة من الأكواد الرقمية وكمياتها وتكاليفها."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              aria-label="تحديث"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              تحديث
            </Button>
            <Button variant="outline" asChild>
              <Link to="/digital-inventory">
                <ArrowRight className="h-4 w-4" />
                رجوع للمخزون
              </Link>
            </Button>
          </div>
        }
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض المخزون الرقمي» للاطّلاع على الدفعات."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items}
            rowKey={(row) => row.id}
            isLoading={loading}
            isError={error}
            onRetry={() => void load()}
            emptyTitle="لا توجد دفعات"
            emptyDescription="لم يتم استيراد أي دفعة أكواد بعد."
          />

          {!loading && !error && total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                صفحة {page} من {totalPages} · {total} دفعة
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  التالي
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
