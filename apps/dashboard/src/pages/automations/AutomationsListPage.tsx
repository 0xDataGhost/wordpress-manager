import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Workflow } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { listAutomations, type AutomationDto } from "@/lib/automations-api";

export function AutomationsListPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("automations.view");
  const canEdit = hasPermission("automations.edit");

  const [items, setItems] = useState<AutomationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await listAutomations();
      setItems(result);
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

  // Replace one automation in place after a toggle/config save.
  function handleChange(updated: AutomationDto) {
    setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الأتمتة"
        description="فعّل الأتمتة الأساسية لمتجرك: تنبيهات المخزون، التقرير اليومي، ورسائل واتساب للطلبات."
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض الأتمتة» للاطّلاع على هذه الصفحة."
        />
      ) : loading ? (
        <LoadingState variant="skeleton" rows={3} />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="لا توجد أتمتة"
          description="ستظهر هنا الأتمتة المتاحة لمتجرك."
        />
      ) : (
        <div className="space-y-4">
          {items.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              canEdit={canEdit}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
