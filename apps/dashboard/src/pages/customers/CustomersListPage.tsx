import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import {
  listCustomers,
  type CustomerDto,
  type CustomerPagination,
} from "@/lib/customers-api";
import { formatDateTime, formatMoney } from "@/lib/utils";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export function CustomersListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<CustomerDto[]>([]);
  const [pagination, setPagination] = useState<CustomerPagination | null>(null);
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
      const result = await listCustomers({
        search: search || undefined,
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
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<CustomerDto>[] = [
    {
      key: "name",
      header: "الاسم",
      cell: (row) => <span className="font-medium">{row.name || "—"}</span>,
    },
    {
      key: "email",
      header: "البريد الإلكتروني",
      cell: (row) =>
        row.email ? (
          <span dir="ltr" className="text-sm">
            {row.email}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
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
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "ordersCount",
      header: "عدد الطلبات",
      cell: (row) => <span>{row.ordersCount}</span>,
    },
    {
      key: "totalSpent",
      header: "إجمالي الإنفاق",
      cell: (row) => <span dir="ltr">{formatMoney(row.totalSpent)}</span>,
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
        title="العملاء"
        description="اطّلع على عملاء متجرك المُزامنين من ووكومرس: ابحث، وتابع سجلّ طلباتهم وإنفاقهم."
      />

      <FilterBar>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="ابحث بالاسم أو البريد أو الهاتف…"
          className="sm:max-w-sm"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا يوجد عملاء"
        emptyDescription="لم يتم العثور على عملاء مطابقين. جرّب مزامنة المتجر أو تعديل البحث."
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
      />

      {!loading && !error && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page} من {totalPages} · {total} عميل
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
