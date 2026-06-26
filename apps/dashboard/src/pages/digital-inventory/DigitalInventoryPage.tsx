import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  KeyRound,
  Layers,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Upload,
  XCircle,
  Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatsCard } from "@/components/shared/StatsCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  CODE_STATUS_OPTIONS,
  getManualStatusTargets,
  resolveCodeStatus,
} from "@/components/digital-inventory/digital-code-status";
import { ImportCodesDialog } from "@/components/digital-inventory/ImportCodesDialog";
import { RevealCodeDialog } from "@/components/digital-inventory/RevealCodeDialog";
import { StatusChangeDialog } from "@/components/digital-inventory/StatusChangeDialog";
import { CodeDetailsDialog } from "@/components/digital-inventory/CodeDetailsDialog";
import {
  getSummary,
  listCodes,
  type Batch,
  type CodeListItem,
  type DigitalCodeStatus,
  type InventorySummary,
  type Pagination,
  listBatches,
} from "@/lib/digital-inventory-api";
import { listProducts, type ProductDto } from "@/lib/products-api";
import { listSuppliers, type SupplierListItem } from "@/lib/suppliers-api";
import { formatDateTime, formatMoney } from "@/lib/utils";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const filterSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-48";

type RevealTarget = { id: string; codePreview: string | null };
type StatusTarget = { id: string; status: string; codePreview: string | null };

export function DigitalInventoryPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("digital_inventory.view");
  const canImport = hasPermission("digital_inventory.import");
  const canReveal = hasPermission("digital_inventory.reveal");
  const canEdit = hasPermission("digital_inventory.edit");
  const canViewSuppliers = hasPermission("digital_suppliers.view");

  const [productId, setProductId] = useState("all");
  const [status, setStatus] = useState<DigitalCodeStatus | "all">("all");
  const [batchId, setBatchId] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [expiresBefore, setExpiresBefore] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [items, setItems] = useState<CodeListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [products, setProducts] = useState<ProductDto[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [revealTarget, setRevealTarget] = useState<RevealTarget | null>(null);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Load the product + batch dropdown options once (best-effort).
  useEffect(() => {
    if (!canView) return;
    listProducts({ limit: 100 })
      .then((res) => setProducts(res.items))
      .catch(() => setProducts([]));
    listBatches({ limit: 100 })
      .then((res) => setBatches(res.items))
      .catch(() => setBatches([]));
  }, [canView]);

  // Suppliers power the supplier filter/column + import selector. Only fetched
  // when the user can view suppliers (otherwise the endpoint 403s); best-effort.
  useEffect(() => {
    if (!canView || !canViewSuppliers) return;
    listSuppliers({ limit: 100 })
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
  }, [canView, canViewSuppliers]);

  const supplierName = useCallback(
    (id: string | null): string | null => {
      if (!id) return null;
      return suppliers.find((s) => s.id === id)?.name ?? null;
    },
    [suppliers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const scopedProduct = productId === "all" ? undefined : productId;
      const [summaryResult, codesResult] = await Promise.all([
        getSummary(scopedProduct),
        listCodes({
          productId: scopedProduct,
          batchId: batchId === "all" ? undefined : batchId,
          supplierId: supplierId === "all" ? undefined : supplierId,
          status: status === "all" ? undefined : status,
          search: search || undefined,
          expiresBefore: expiresBefore || undefined,
          page,
          limit: PAGE_SIZE,
        }),
      ]);
      setSummary(summaryResult);
      setItems(codesResult.items);
      setPagination(codesResult.pagination);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [productId, batchId, supplierId, status, search, expiresBefore, page]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const columns: Column<CodeListItem>[] = [
    {
      key: "productName",
      header: "المنتج",
      cell: (row) => <span className="font-medium">{row.productName ?? "—"}</span>,
    },
    {
      key: "codePreview",
      header: "معاينة الكود",
      cell: (row) => (
        <span dir="ltr" className="font-mono text-sm text-muted-foreground">
          {row.codePreview ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => (
        <StatusBadge
          label={resolveCodeStatus(row.status).label}
          tone={resolveCodeStatus(row.status).tone}
        />
      ),
    },
    {
      key: "batchName",
      header: "الدفعة",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.batchName ?? "—"}
        </span>
      ),
    },
    // Supplier column is only shown to roles that can view suppliers (RBAC):
    // the name is resolved from the suppliers list loaded above.
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
        ] as Column<CodeListItem>[])
      : []),
    {
      key: "cost",
      header: "التكلفة",
      cell: (row) => (
        <span dir="ltr" className="text-sm">
          {row.costPrice
            ? formatMoney(row.costPrice, row.currency ?? "SAR")
            : "—"}
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: "تاريخ الانتهاء",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.expiresAt ? formatDateTime(row.expiresAt) : "—"}
        </span>
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
    {
      key: "actions",
      header: "إجراءات",
      cell: (row) => {
        const canChangeStatus =
          canEdit && getManualStatusTargets(row.status).length > 0;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="عرض التفاصيل"
              title="عرض التفاصيل"
              onClick={() => setDetailsId(row.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canReveal ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="كشف الكود"
                title="كشف الكود"
                onClick={() =>
                  setRevealTarget({ id: row.id, codePreview: row.codePreview })
                }
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            ) : null}
            {canChangeStatus ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="تغيير الحالة"
                title="تغيير الحالة"
                onClick={() =>
                  setStatusTarget({
                    id: row.id,
                    status: row.status,
                    codePreview: row.codePreview,
                  })
                }
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="المخزون الرقمي" description="إدارة مخزون الأكواد الرقمية." />
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض المخزون الرقمي» للاطّلاع على هذه الصفحة."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="المخزون الرقمي"
        description="تابع أكواد المنتجات الرقمية، استورد دفعات جديدة، واكشف الأكواد بشكل آمن."
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
              <Link to="/digital-inventory/batches">
                <Layers className="h-4 w-4" />
                دفعات الأكواد
              </Link>
            </Button>
            {canImport ? (
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                استيراد أكواد
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatsCard title="إجمالي الأكواد" value={summary?.totalCodes ?? 0} icon={Boxes} />
        <StatsCard title="المتاح" value={summary?.available ?? 0} icon={CheckCircle2} />
        <StatsCard title="المحجوز" value={summary?.reserved ?? 0} icon={Layers} />
        <StatsCard title="المباع" value={summary?.sold ?? 0} icon={ShoppingCart} />
        <StatsCard title="المسلم" value={summary?.delivered ?? 0} icon={PackageCheck} />
        <StatsCard title="غير صالح" value={summary?.invalid ?? 0} icon={XCircle} />
        <StatsCard
          title="منخفض المخزون"
          value={summary?.lowStockProducts.length ?? 0}
          icon={AlertTriangle}
        />
      </div>

      {summary && summary.lowStockProducts.length > 0 ? (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" />
            منتجات منخفضة المخزون
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {summary.lowStockProducts.map((p) => (
              <li key={p.productId}>
                <span className="font-medium text-foreground">
                  {p.productName ?? "—"}
                </span>{" "}
                — متاح {p.available} / الحد {p.threshold}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FilterBar>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="ابحث بمعاينة الكود أو المنتج أو الدفعة…"
          className="sm:max-w-xs"
        />
        <select
          aria-label="تصفية حسب المنتج"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setPage(1);
          }}
          className={filterSelectClass}
        >
          <option value="all">كل المنتجات</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الحالة"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DigitalCodeStatus | "all");
            setPage(1);
          }}
          className={filterSelectClass}
        >
          <option value="all">كل الحالات</option>
          {CODE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الدفعة"
          value={batchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            setPage(1);
          }}
          className={filterSelectClass}
        >
          <option value="all">كل الدفعات</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchName ?? `دفعة ${b.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
        {canViewSuppliers && suppliers.length > 0 ? (
          <select
            aria-label="تصفية حسب المورد"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPage(1);
            }}
            className={filterSelectClass}
          >
            <option value="all">كل الموردين</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="date"
          aria-label="تنتهي قبل تاريخ"
          title="تنتهي قبل تاريخ"
          dir="ltr"
          value={expiresBefore}
          onChange={(e) => {
            setExpiresBefore(e.target.value);
            setPage(1);
          }}
          className={filterSelectClass}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا توجد أكواد"
        emptyDescription="لم يتم العثور على أكواد مطابقة. استورد دفعة جديدة أو عدّل عوامل التصفية."
      />

      {!loading && !error && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page} من {totalPages} · {total} كود
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

      {canImport ? (
        <ImportCodesDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          products={products}
          suppliers={suppliers}
          onImported={() => void load()}
        />
      ) : null}

      <CodeDetailsDialog
        codeId={detailsId}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      />

      <RevealCodeDialog
        target={revealTarget}
        onOpenChange={(open) => {
          if (!open) setRevealTarget(null);
        }}
      />

      <StatusChangeDialog
        target={statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        onUpdated={() => void load()}
      />
    </div>
  );
}
