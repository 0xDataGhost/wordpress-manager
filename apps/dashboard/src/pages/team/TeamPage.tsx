import { useCallback, useEffect, useState } from "react";
import { Eye, KeyRound, ShieldAlert, ShieldCheck, Users, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard } from "@/components/shared/StatsCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { RoleDetailsDialog } from "@/components/team/RoleDetailsDialog";
import { countDistinctPermissions } from "@/components/team/permission-catalog";
import { listRoles, type RoleDto } from "@/lib/roles-api";

export function TeamPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("team.view");

  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<RoleDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRoles(await listRoles());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <PageHeader
          title="الموظفون والصلاحيات"
          description="إدارة الأدوار والصلاحيات في المتجر."
        />
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض الموظفين والصلاحيات» للاطّلاع على هذه الصفحة."
        />
      </div>
    );
  }

  const manageableRoles = roles.filter((r) => !r.isSystem).length;
  const totalPermissions = countDistinctPermissions(roles);

  const columns: Column<RoleDto>[] = [
    {
      key: "name",
      header: "اسم الدور",
      cell: (role) => <span className="font-medium">{role.name}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      cell: (role) => (
        <span className="text-sm text-muted-foreground">
          {role.description?.trim() || "—"}
        </span>
      ),
    },
    {
      key: "permissions",
      header: "عدد الصلاحيات",
      cell: (role) => role.permissions.length,
    },
    {
      key: "editable",
      header: "هل قابل للتعديل",
      cell: (role) =>
        role.isSystem ? (
          <StatusBadge label="غير قابل للتعديل" tone="neutral" />
        ) : (
          <StatusBadge label="قابل للتعديل" tone="success" />
        ),
    },
    {
      key: "actions",
      header: "الإجراءات",
      cell: (role) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelected(role)}
          aria-label={`عرض تفاصيل دور ${role.name}`}
        >
          <Eye className="h-4 w-4" />
          عرض التفاصيل
        </Button>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الموظفون والصلاحيات"
        description="اطّلع على الأدوار المتاحة في النظام والصلاحيات التي يمنحها كل دور."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard
          title="عدد الأدوار"
          value={loading ? "…" : roles.length}
          icon={ShieldCheck}
        />
        <StatsCard
          title="عدد الصلاحيات"
          value={loading ? "…" : totalPermissions}
          icon={KeyRound}
        />
        <StatsCard
          title="أدوار قابلة للإدارة"
          value={loading ? "…" : manageableRoles}
          icon={Users}
        />
      </div>

      <DataTable
        columns={columns}
        data={roles}
        rowKey={(role) => role.id}
        isLoading={loading}
        isError={error}
        onRetry={() => void load()}
        emptyTitle="لا توجد أدوار"
        emptyDescription="لم يتم العثور على أي أدوار في النظام."
      />

      {/* Team-member management has no backend yet — show an honest info state,
          never fake employees or broken buttons. */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">إدارة الموظفين</h2>
        <EmptyState
          icon={UserPlus}
          title="إدارة الموظفين لم تكتمل بعد"
          description="النظام يدعم الأدوار والصلاحيات حاليًا، وسيتم إضافة دعوة الموظفين لاحقًا."
        />
      </div>

      <RoleDetailsDialog
        role={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
