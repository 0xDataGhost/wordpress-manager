import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { CouponFormDialog } from "@/components/coupons/CouponFormDialog";
import { DISCOUNT_TYPE_LABELS } from "@/components/coupons/coupon-labels";
import {
  deleteCoupon,
  listCoupons,
  type CouponDto,
  type CouponPagination,
} from "@/lib/coupons-api";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** Format the coupon value: `%` for percentage, plain number otherwise. */
function formatAmount(coupon: CouponDto): string {
  const value = Number(coupon.amount);
  const display = Number.isNaN(value)
    ? coupon.amount
    : value.toLocaleString("ar-EG");
  return coupon.discountType === "percent" ? `${display}%` : display;
}

/** Show the expiry as a plain date, or an em dash when the coupon never expires. */
function formatExpiry(dateExpires: string | null): string {
  return dateExpires ? dateExpires.slice(0, 10) : "—";
}

export function CouponsListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("coupons.manage");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<CouponDto[]>([]);
  const [pagination, setPagination] = useState<CouponPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponDto | null>(null);

  const [deleting, setDeleting] = useState<CouponDto | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      const result = await listCoupons({
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

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(coupon: CouponDto) {
    setEditing(coupon);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setActionError(null);
    try {
      await deleteCoupon(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر حذف الكوبون. حاول مرة أخرى.",
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<CouponDto>[] = [
    {
      key: "code",
      header: "الكود",
      cell: (row) => (
        <span dir="ltr" className="font-mono text-sm font-medium">
          {row.code}
        </span>
      ),
    },
    {
      key: "discountType",
      header: "النوع",
      cell: (row) => (
        <span className="text-sm">{DISCOUNT_TYPE_LABELS[row.discountType]}</span>
      ),
    },
    {
      key: "amount",
      header: "القيمة",
      cell: (row) => (
        <span dir="ltr" className="text-sm">
          {formatAmount(row)}
        </span>
      ),
    },
    {
      key: "usage",
      header: "الاستخدام",
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {row.usageCount} / {row.usageLimit ?? "∞"}
        </span>
      ),
    },
    {
      key: "dateExpires",
      header: "تنتهي في",
      cell: (row) => (
        <span dir="ltr" className="text-xs text-muted-foreground">
          {formatExpiry(row.dateExpires)}
        </span>
      ),
    },
    {
      key: "freeShipping",
      header: "الشحن المجاني",
      cell: (row) =>
        row.freeShipping ? (
          <StatusBadge label="مجاني" tone="success" />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-36",
            cell: (row: CouponDto) => (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-4 w-4" />
                  تعديل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionError(null);
                    setDeleting(row);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            ),
          } satisfies Column<CouponDto>,
        ]
      : []),
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الكوبونات"
        description="إدارة كوبونات الخصم في متجر ووردبريس"
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              إنشاء كوبون
            </Button>
          ) : null
        }
      />

      {actionError ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      <FilterBar>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="ابحث بكود الكوبون…"
          className="sm:max-w-xs"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا توجد كوبونات بعد"
        emptyDescription="لا توجد كوبونات بعد — أنشئ أول كوبون"
      />

      {!loading && !error && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page} من {totalPages} · {total} كوبون
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

      {canManage ? (
        <>
          <CouponFormDialog
            open={formOpen}
            coupon={editing}
            onOpenChange={setFormOpen}
            onSaved={() => void load()}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
            title="حذف الكوبون؟"
            description="حذف الكوبون؟ لن يعود صالحاً في المتجر"
            confirmLabel="حذف"
            destructive
            loading={deleteLoading}
            onConfirm={() => void handleDelete()}
          />
        </>
      ) : null}
    </div>
  );
}
