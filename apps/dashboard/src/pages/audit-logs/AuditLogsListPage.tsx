import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  resolveAuditAction,
  resolveAuditEntity,
} from "@/components/audit-logs/audit-display";
import {
  AUDIT_ACTION_VALUES,
  AUDIT_ENTITY_VALUES,
  listAuditLogs,
  type AuditLogDto,
  type AuditLogPagination,
} from "@/lib/audit-logs-api";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 20;

const filterSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-52";
const dateInputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-40";

/** Best display for the acting user; system/connector actions have no user. */
function actorLabel(log: AuditLogDto): string {
  if (log.user) {
    return log.user.fullName?.trim() || log.user.email || "—";
  }
  return "النظام";
}

export function AuditLogsListPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("settings.view");

  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AuditLogDto[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listAuditLogs({
        action: action === "all" ? undefined : action,
        entityType: entityType === "all" ? undefined : entityType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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
  }, [action, entityType, dateFrom, dateTo, page]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const columns: Column<AuditLogDto>[] = [
    {
      key: "action",
      header: "الإجراء",
      cell: (row) => {
        const meta = resolveAuditAction(row.action);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "entityType",
      header: "النوع",
      cell: (row) => (
        <span className="text-sm">{resolveAuditEntity(row.entityType)}</span>
      ),
    },
    {
      key: "message",
      header: "التفاصيل",
      cell: (row) => <span className="text-sm">{row.message}</span>,
    },
    {
      key: "user",
      header: "المستخدم",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{actorLabel(row)}</span>
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
  ];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="سجلّ التدقيق"
        description="تابع الإجراءات المهمة على متجرك: تسجيلات الدخول، تعديلات المنتجات، الإعدادات، الأتمتة، المزامنة وأحداث الويب هوك."
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض الإعدادات» للاطّلاع على سجلّ التدقيق."
        />
      ) : (
        <>
          <FilterBar>
            <select
              aria-label="تصفية حسب الإجراء"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className={filterSelectClass}
            >
              <option value="all">كل الإجراءات</option>
              {AUDIT_ACTION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {resolveAuditAction(value).label}
                </option>
              ))}
            </select>
            <select
              aria-label="تصفية حسب النوع"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              className={filterSelectClass}
            >
              <option value="all">كل الأنواع</option>
              {AUDIT_ENTITY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {resolveAuditEntity(value)}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="من تاريخ"
              dir="ltr"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className={dateInputClass}
            />
            <input
              type="date"
              aria-label="إلى تاريخ"
              dir="ltr"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className={dateInputClass}
            />
          </FilterBar>

          <DataTable
            columns={columns}
            data={items}
            rowKey={(row) => row.id}
            isLoading={loading}
            isError={error}
            onRetry={() => void load()}
            emptyTitle="لا توجد سجلات"
            emptyDescription="لم يتم العثور على سجلات مطابقة. جرّب تعديل عوامل التصفية."
          />

          {!loading && !error && total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                صفحة {page} من {totalPages} · {total} سجل
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
