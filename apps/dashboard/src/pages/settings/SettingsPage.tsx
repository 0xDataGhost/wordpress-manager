import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSettings, type SettingsDto } from "@/lib/settings-api";

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("settings.view");
  const canEdit = hasPermission("settings.edit");

  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSettings(await getSettings());
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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الإعدادات"
        description="إدارة إعدادات متجرك العامة والإشعارات ولوحة التحكم والهوية."
      />

      {!canView ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا تملك صلاحية الوصول"
          description="تحتاج صلاحية «عرض الإعدادات» للاطّلاع على هذه الصفحة."
        />
      ) : loading ? (
        <LoadingState variant="skeleton" rows={4} />
      ) : error || !settings ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <SettingsForm
          settings={settings}
          canEdit={canEdit}
          onSaved={setSettings}
        />
      )}
    </div>
  );
}
