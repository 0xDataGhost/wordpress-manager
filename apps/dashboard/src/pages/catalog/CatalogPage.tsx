import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { TaxonomyTermDialog } from "@/components/catalog/TaxonomyTermDialog";
import {
  TAXONOMY_VALUES,
  createTaxonomyTerm,
  deleteTaxonomyTerm,
  listTaxonomyTerms,
  updateTaxonomyTerm,
  type Taxonomy,
  type TaxonomyPagination,
  type TaxonomyTermDto,
  type TaxonomyTermInput,
} from "@/lib/catalog-api";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const TAB_LABELS: Record<Taxonomy, string> = {
  categories: "التصنيفات",
  tags: "الوسوم",
  attributes: "الخصائص",
};

const SEARCH_PLACEHOLDERS: Record<Taxonomy, string> = {
  categories: "ابحث باسم التصنيف…",
  tags: "ابحث باسم الوسم…",
  attributes: "ابحث باسم الخاصية…",
};

const EMPTY_TITLE = "لا توجد عناصر بعد — أنشئ واحداً أو زامن متجرك";

type DialogState = {
  open: boolean;
  term: TaxonomyTermDto | null;
};

function TaxonomyTab({ taxonomy }: { taxonomy: Taxonomy }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("catalog.manage_taxonomies");
  const isCategory = taxonomy === "categories";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<TaxonomyTermDto[]>([]);
  const [pagination, setPagination] = useState<TaxonomyPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [dialog, setDialog] = useState<DialogState>({ open: false, term: null });
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TaxonomyTermDto | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      const result = await listTaxonomyTerms(taxonomy, {
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
  }, [taxonomy, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setDialogError(null);
    setDialog({ open: true, term: null });
  }

  function openEdit(term: TaxonomyTermDto) {
    setDialogError(null);
    setDialog({ open: true, term });
  }

  async function handleSubmit(input: TaxonomyTermInput) {
    setSaving(true);
    setDialogError(null);
    try {
      if (dialog.term) {
        await updateTaxonomyTerm(taxonomy, dialog.term.id, input);
      } else {
        await createTaxonomyTerm(taxonomy, input);
      }
      setDialog({ open: false, term: null });
      await load();
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "تعذّر حفظ العنصر. حاول مرة أخرى.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteTaxonomyTerm(taxonomy, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر حذف العنصر. حاول مرة أخرى.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TaxonomyTermDto>[] = [
    {
      key: "name",
      header: "الاسم",
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "slug",
      header: "المُعرّف",
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {row.slug || "—"}
        </span>
      ),
    },
    ...(isCategory
      ? [
          {
            key: "parent",
            header: "الأب",
            cell: (row: TaxonomyTermDto) =>
              row.parentWpId != null ? (
                <span dir="ltr" className="text-xs text-muted-foreground">
                  #{row.parentWpId}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          } satisfies Column<TaxonomyTermDto>,
        ]
      : []),
    {
      key: "count",
      header: "المنتجات",
      cell: (row) => (
        <span dir="ltr" className="text-sm">
          {row.count}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-32",
            cell: (row: TaxonomyTermDto) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="تعديل"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  onClick={() => {
                    setActionError(null);
                    setDeleteTarget(row);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ),
          } satisfies Column<TaxonomyTermDto>,
        ]
      : []),
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      <FilterBar
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              عنصر جديد
            </Button>
          ) : null
        }
      >
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder={SEARCH_PLACEHOLDERS[taxonomy]}
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
        emptyTitle={EMPTY_TITLE}
        emptyDescription="ستظهر عناصر التصنيف هنا بعد إنشائها أو مزامنتها من المتجر."
      />

      {!loading && !error && total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page} من {totalPages} · {total} عنصر
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

      <TaxonomyTermDialog
        open={dialog.open}
        onOpenChange={(open) =>
          setDialog((prev) => ({ open, term: open ? prev.term : null }))
        }
        taxonomy={taxonomy}
        term={dialog.term}
        parentOptions={items}
        loading={saving}
        errorMessage={dialogError}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="حذف العنصر"
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name}». لا يمكن التراجع عن هذا الإجراء.`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

export function CatalogPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("products.view");
  const [activeTab, setActiveTab] = useState<Taxonomy>("categories");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="تصنيفات المتجر"
        description="أدر تصنيفات المتجر ووسومه وخصائصه — أنشئها، عدّلها، واحذفها."
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض المنتجات» للاطّلاع على هذه الصفحة."
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="أنواع التصنيفات"
            className="mb-4 inline-flex rounded-lg border bg-card p-1"
          >
            {TAXONOMY_VALUES.map((value) => {
              const isActive = value === activeTab;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(value)}
                  className={
                    isActive
                      ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {TAB_LABELS[value]}
                </button>
              );
            })}
          </div>

          {/* Remount on tab change so each taxonomy owns fresh state. */}
          <TaxonomyTab key={activeTab} taxonomy={activeTab} />
        </>
      )}
    </div>
  );
}
