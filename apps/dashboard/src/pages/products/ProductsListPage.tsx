import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { PRODUCT_STATUS_META } from "@/components/products/product-status";
import {
  listProducts,
  type ProductDto,
  type ProductPagination,
  type ProductStatus,
} from "@/lib/products-api";
import { cn, formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_FILTERS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: PRODUCT_STATUS_META.draft.label },
  { value: "active", label: PRODUCT_STATUS_META.active.label },
  { value: "archived", label: PRODUCT_STATUS_META.archived.label },
];

function formatPrice(price: string): string {
  const value = Number(price);
  if (Number.isNaN(value)) return price;
  return `${value.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ر.س`;
}

export function ProductsListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("products.create");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ProductDto[]>([]);
  const [pagination, setPagination] = useState<ProductPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Debounce the search box so each keystroke does not fire a request.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listProducts({
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setPagination(result.pagination);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<ProductDto>[] = [
    {
      key: "name",
      header: "المنتج",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          {row.shortDescription ? (
            <span className="text-xs text-muted-foreground">
              {row.shortDescription}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "price",
      header: "السعر",
      cell: (row) => <span dir="ltr">{formatPrice(row.price)}</span>,
    },
    {
      key: "stockQuantity",
      header: "المخزون",
      cell: (row) => (
        <span className={cn(row.stockQuantity === 0 && "text-destructive")}>
          {row.stockQuantity}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => (
        <StatusBadge
          label={PRODUCT_STATUS_META[row.status].label}
          tone={PRODUCT_STATUS_META[row.status].tone}
        />
      ),
    },
    {
      key: "wpProductId",
      header: "ووكومرس",
      cell: (row) =>
        row.wpProductId ? (
          <span dir="ltr" className="text-xs text-muted-foreground">
            #{row.wpProductId}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">غير منشور</span>
        ),
    },
    {
      key: "updatedAt",
      header: "آخر تحديث",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(row.updatedAt)}
        </span>
      ),
    },
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="المنتجات"
        description="أدر كتالوج منتجاتك: أضف منتجات جديدة، عدّلها، وتابع حالتها."
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/products/new">
                <Plus className="h-4 w-4" />
                منتج جديد
              </Link>
            </Button>
          ) : null
        }
      />

      <FilterBar>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="ابحث باسم المنتج…"
          className="sm:max-w-xs"
        />
        <select
          aria-label="تصفية حسب الحالة"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ProductStatus | "all");
            setPage(1);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-44"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا توجد منتجات"
        emptyDescription="ابدأ بإضافة أول منتج إلى كتالوجك."
        onRowClick={(row) => navigate(`/products/${row.id}`)}
      />

      {!loading && !error && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page} من {totalPages} · {total} منتج
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
    </div>
  );
}
