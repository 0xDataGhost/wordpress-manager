import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  RotateCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatsCard } from "@/components/shared/StatsCard";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  WP_COMMAND_DOMAIN_VALUES,
  WP_COMMAND_STATUS_VALUES,
  getWpCommandStats,
  listWpCommands,
  retryWpCommand,
  type WpCommandDto,
  type WpCommandPagination,
  type WpCommandStats,
  type WpCommandStatus,
} from "@/lib/wp-commands-api";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 20;

const filterSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-52";

/** Statuses eligible for a manual retry — mirrors the backend rule. */
const RETRYABLE_STATUSES: readonly WpCommandStatus[] = ["failed", "dead"];

const STATUS_META: Record<
  WpCommandStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "قيد الانتظار", tone: "neutral" },
  sending: { label: "جارٍ الإرسال", tone: "neutral" },
  succeeded: { label: "ناجح", tone: "success" },
  conflict: { label: "تعارض", tone: "warning" },
  failed: { label: "فاشل", tone: "danger" },
  dead: { label: "متوقف نهائياً", tone: "danger" },
};

const DOMAIN_LABELS: Record<string, string> = {
  product: "منتج",
  order: "طلب",
  coupon: "كوبون",
  customer: "عميل",
  review: "تقييم",
  settings: "إعدادات",
  shipping: "شحن",
  tax: "ضرائب",
  media: "وسائط",
  taxonomy: "تصنيفات",
};

/** Arabic labels for known domain.action pairs; unknown pairs fall back raw. */
const COMMAND_LABELS: Record<string, string> = {
  "product.create": "إنشاء منتج",
  "product.update": "تحديث منتج",
  "order.add_digital_note": "إضافة ملاحظة رقمية للطلب",
};

function commandLabel(row: WpCommandDto): string {
  return COMMAND_LABELS[`${row.domain}.${row.action}`] ?? `${row.domain}.${row.action}`;
}

export function WpCommandsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("wp_commands.view");
  const canManage = hasPermission("wp_commands.manage");

  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<WpCommandDto[]>([]);
  const [pagination, setPagination] = useState<WpCommandPagination | null>(
    null,
  );
  const [stats, setStats] = useState<WpCommandStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listWpCommands({
        status: status === "all" ? undefined : status,
        domain: domain === "all" ? undefined : domain,
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
  }, [status, domain, page]);

  // Stats are decorative context — a failure hides the cards, not the page.
  const loadStats = useCallback(async () => {
    try {
      setStats(await getWpCommandStats());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  useEffect(() => {
    if (!canView) return;
    void loadStats();
  }, [canView, loadStats]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setActionError(null);
    try {
      await retryWpCommand(id);
      await Promise.all([load(), loadStats()]);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "تعذّرت إعادة المحاولة. حاول مرة أخرى.",
      );
    } finally {
      setRetryingId(null);
    }
  };

  const columns: Column<WpCommandDto>[] = [
    {
      key: "command",
      header: "الأمر",
      cell: (row) => (
        <span className="text-sm font-medium">{commandLabel(row)}</span>
      ),
    },
    {
      key: "targetWpId",
      header: "المعرّف في ووردبريس",
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {row.targetWpId ?? "—"}
        </span>
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
      key: "attempts",
      header: "المحاولات",
      cell: (row) => (
        <span dir="ltr" className="text-sm">
          {row.attempts}
        </span>
      ),
    },
    {
      key: "lastError",
      header: "آخر خطأ",
      cell: (row) =>
        row.lastError ? (
          <span
            dir="ltr"
            title={row.lastError}
            className="block max-w-56 truncate text-xs text-muted-foreground"
          >
            {row.lastError}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            headerClassName: "w-32",
            cell: (row: WpCommandDto) =>
              RETRYABLE_STATUSES.includes(row.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retryingId !== null}
                  onClick={() => void handleRetry(row.id)}
                >
                  <RotateCw className="h-4 w-4" />
                  {retryingId === row.id ? "جارٍ الإرسال…" : "إعادة المحاولة"}
                </Button>
              ) : null,
          } satisfies Column<WpCommandDto>,
        ]
      : []),
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="مركز أوامر ووردبريس"
        description="كل التعديلات الصادرة من النظام إلى متجر ووردبريس — الحالة، الأخطاء، وإعادة المحاولة"
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض أوامر ووردبريس» للاطّلاع على هذه الصفحة."
        />
      ) : (
        <>
          {stats ? (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatsCard title="إجمالي" value={stats.total} icon={ListChecks} />
              <StatsCard
                title="ناجحة"
                value={stats.byStatus.succeeded}
                icon={CheckCircle2}
              />
              <StatsCard
                title="فاشلة"
                value={stats.byStatus.failed + stats.byStatus.dead}
                icon={XCircle}
                hint={
                  stats.byStatus.dead > 0
                    ? `${stats.byStatus.dead} متوقفة نهائياً`
                    : undefined
                }
              />
              <StatsCard
                title="تعارضات"
                value={stats.byStatus.conflict}
                icon={AlertTriangle}
              />
            </div>
          ) : null}

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
              <option value="all">كل الحالات</option>
              {WP_COMMAND_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </select>
            <select
              aria-label="تصفية حسب النطاق"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setPage(1);
              }}
              className={filterSelectClass}
            >
              <option value="all">كل النطاقات</option>
              {WP_COMMAND_DOMAIN_VALUES.map((value) => (
                <option key={value} value={value}>
                  {DOMAIN_LABELS[value]}
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
            emptyTitle="لا توجد أوامر بعد"
            emptyDescription="التعديلات الصادرة إلى ووردبريس ستظهر هنا"
          />

          {!loading && !error && total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                صفحة {page} من {totalPages} · {total} أمر
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
