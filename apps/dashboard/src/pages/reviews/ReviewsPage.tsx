import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  MessageSquareReply,
  PauseCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { ReviewReplyDialog } from "@/components/reviews/ReviewReplyDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listReviews,
  moderateReview,
  type ReviewDto,
  type ReviewPagination,
  type ReviewStatus,
} from "@/lib/reviews-api";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const MAX_RATING = 5;

const filterSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-52";

const STATUS_META: Record<ReviewStatus, { label: string; tone: StatusTone }> = {
  approved: { label: "منشور", tone: "success" },
  hold: { label: "بانتظار", tone: "warning" },
  spam: { label: "سبام", tone: "danger" },
  trash: { label: "مهملات", tone: "danger" },
};

/** Quick moderation actions shown per row (icon + target status). */
const MODERATION_ACTIONS: readonly {
  status: ReviewStatus;
  label: string;
  icon: typeof Check;
}[] = [
  { status: "approved", label: "اعتماد", icon: Check },
  { status: "hold", label: "تعليق", icon: PauseCircle },
  { status: "spam", label: "سبام", icon: Ban },
  { status: "trash", label: "حذف", icon: Trash2 },
];

/** Render the rating as filled/empty stars, with a `dir="ltr"` numeric title. */
function renderRating(rating: number): string {
  const filled = Math.max(0, Math.min(MAX_RATING, Math.round(rating)));
  return "★".repeat(filled) + "☆".repeat(MAX_RATING - filled);
}

export function ReviewsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("reviews.view");
  const canModerate = hasPermission("reviews.moderate");

  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ReviewDto[]>([]);
  const [pagination, setPagination] = useState<ReviewPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [replying, setReplying] = useState<ReviewDto | null>(null);

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
      const result = await listReviews({
        status: status === "all" ? undefined : (status as ReviewStatus),
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
  }, [status, search, page]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const handleModerate = async (id: string, next: ReviewStatus) => {
    setPendingId(id);
    setActionError(null);
    try {
      await moderateReview(id, next);
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "تعذّرت تنقية التقييم. حاول مرة أخرى.",
      );
    } finally {
      setPendingId(null);
    }
  };

  const columns: Column<ReviewDto>[] = [
    {
      key: "productName",
      header: "المنتج",
      cell: (row) => (
        <span className="text-sm font-medium">{row.productName ?? "—"}</span>
      ),
    },
    {
      key: "rating",
      header: "التقييم",
      cell: (row) => (
        <span
          dir="ltr"
          title={`${row.rating}/${MAX_RATING}`}
          className="text-sm text-amber-500"
        >
          {renderRating(row.rating)}
        </span>
      ),
    },
    {
      key: "author",
      header: "المُقيّم",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.author ?? "—"}</span>
          {row.authorEmail ? (
            <span dir="ltr" className="text-xs text-muted-foreground">
              {row.authorEmail}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "content",
      header: "المحتوى",
      cell: (row) =>
        row.content ? (
          <span
            title={row.content}
            className="block max-w-72 truncate text-sm text-muted-foreground"
          >
            {row.content}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const meta = STATUS_META[row.status];
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "wpDateCreated",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(row.wpDateCreated)}
        </span>
      ),
    },
    ...(canModerate
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-72",
            cell: (row: ReviewDto) => {
              const busy = pendingId !== null;
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  {MODERATION_ACTIONS.map((action) => (
                    <Button
                      key={action.status}
                      variant="outline"
                      size="sm"
                      disabled={busy || row.status === action.status}
                      onClick={() =>
                        void handleModerate(row.id, action.status)
                      }
                    >
                      <action.icon className="h-4 w-4" />
                      {action.label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setActionError(null);
                      setReplying(row);
                    }}
                  >
                    <MessageSquareReply className="h-4 w-4" />
                    ردّ
                  </Button>
                </div>
              );
            },
          } satisfies Column<ReviewDto>,
        ]
      : []),
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="التقييمات"
        description="مراجعة وتنقية تقييمات المنتجات"
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض التقييمات» للاطّلاع على هذه الصفحة."
        />
      ) : (
        <>
          {actionError ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          <FilterBar>
            <select
              aria-label="تصفية حسب الحالة"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={filterSelectClass}
            >
              <option value="all">الكل</option>
              <option value="approved">منشور</option>
              <option value="hold">بانتظار</option>
              <option value="spam">سبام</option>
              <option value="trash">مهملات</option>
            </select>
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="ابحث باسم المنتج…"
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
            emptyTitle="لا توجد تقييمات"
            emptyDescription="ستظهر تقييمات المنتجات هنا لمراجعتها وتنقيتها."
          />

          {!loading && !error && total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                صفحة {page} من {totalPages} · {total} تقييم
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

          {canModerate ? (
            <ReviewReplyDialog
              open={replying !== null}
              review={replying}
              onOpenChange={(open) => {
                if (!open) setReplying(null);
              }}
              onReplied={() => void load()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
