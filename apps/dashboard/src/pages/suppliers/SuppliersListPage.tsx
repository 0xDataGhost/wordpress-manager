import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import {
  SUPPLIER_STATUS_OPTIONS,
  resolveSupplierStatus,
} from "@/components/suppliers/supplier-status";
import {
  listSuppliers,
  type SupplierListItem,
  type SupplierStatus,
} from "@/lib/suppliers-api";
import { formatDateTime } from "@/lib/utils";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PAGE_SIZE = 20;

export function SuppliersListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canView = hasPermission("digital_suppliers.view");
  const canCreate = hasPermission("digital_suppliers.create");

  const [items, setItems] = useState<SupplierListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SupplierStatus | "">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listSuppliers({
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

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="الموردين" description="إدارة موردي الأكواد الرقمية." />
        <EmptyState
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض الموردين» لرؤية هذه الصفحة."
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<SupplierListItem>[] = [
    {
      key: "name",
      header: "اسم المورد",
      cell: (row) => (
        <span className="flex items-center gap-1.5 font-medium">
          {row.isPreferred ? (
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
          ) : null}
          {row.name}
        </span>
      ),
    },
    {
      key: "contactName",
      header: "جهة التواصل",
      cell: (row) => <span>{row.contactName ?? "—"}</span>,
    },
    {
      key: "email",
      header: "البريد",
      cell: (row) =>
        row.email ? (
          <span dir="ltr" className="text-sm">
            {row.email}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "phone",
      header: "الهاتف",
      cell: (row) =>
        row.phone ? (
          <span dir="ltr" className="text-sm">
            {row.phone}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const meta = resolveSupplierStatus(row.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "productsCount",
      header: "عدد المنتجات",
      cell: (row) => <span>{row.productsCount}</span>,
    },
    {
      key: "lastBatchAt",
      header: "آخر دفعة",
      cell: (row) => (
        <span className="text-sm">{formatDateTime(row.lastBatchAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-20",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/suppliers/${row.id}`)}
        >
          عرض
        </Button>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الموردين"
        description="إدارة موردي الأكواد الرقمية وتكاليف الدفعات."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              إضافة مورد
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث باسم المورد…"
          className="sm:max-w-xs"
        />
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as SupplierStatus | "")}
          aria-label="تصفية حسب الحالة"
        >
          <option value="">كل الحالات</option>
          {SUPPLIER_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا يوجد موردون"
        emptyDescription="أضف مورداً لتتبّع مصدر الأكواد وتكاليفها."
      />

      {!loading && !error && total > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} — {total} مورد
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

      <SupplierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
      />
    </div>
  );
}
