import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ConnectionStatusCard } from "@/components/connection/ConnectionStatusCard";
import { ApiKeyCard } from "@/components/connection/ApiKeyCard";
import { ConnectStoreCard } from "@/components/connection/ConnectStoreCard";
import { SyncCard } from "@/components/connection/SyncCard";
import {
  disconnectStore,
  fetchConnectionStatus,
  generateApiKey,
  type ConnectionStatusDto,
} from "@/lib/connector-api";

type Action = "generate" | "disconnect" | "refresh";

export function ConnectionPage() {
  const [status, setStatus] = useState<ConnectionStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Plaintext key from the most recent generation; shown once, never refetched.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setStatus(await fetchConnectionStatus());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    kind: Action,
    fn: () => Promise<ConnectionStatusDto>,
    fallbackError: string,
  ) {
    setAction(kind);
    setActionError(null);
    try {
      setStatus(await fn());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : fallbackError);
    } finally {
      setAction(null);
    }
  }

  async function handleGenerate() {
    setAction("generate");
    setActionError(null);
    try {
      const generated = await generateApiKey();
      setRevealedKey(generated.apiKey);
      setStatus(await fetchConnectionStatus());
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "تعذّر توليد المفتاح.",
      );
    } finally {
      setAction(null);
    }
  }

  function handleRefresh() {
    void run("refresh", fetchConnectionStatus, "تعذّر تحديث الحالة.");
  }

  function handleDisconnect() {
    setRevealedKey(null);
    void run("disconnect", disconnectStore, "تعذّر فصل المتجر.");
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="ربط متجر ووردبريس"
        description="اربط متجر ووكومرس بلوحة التحكم عبر إضافة الموصّل. ولّد مفتاح API، أدخله في ووردبريس، ثم تابع حالة الاتصال من هنا."
      />

      {loading ? (
        <LoadingState />
      ) : loadError || !status ? (
        <ErrorState
          description="تعذّر تحميل حالة الاتصال. يرجى المحاولة مرة أخرى."
          onRetry={() => void load()}
        />
      ) : (
        <div className="space-y-4">
          {actionError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          <ConnectionStatusCard
            status={status}
            onRefresh={handleRefresh}
            refreshing={action === "refresh"}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ApiKeyCard
              status={status}
              revealedKey={revealedKey}
              onGenerate={handleGenerate}
              generating={action === "generate"}
            />
            <ConnectStoreCard
              status={status}
              onDisconnect={handleDisconnect}
              disconnecting={action === "disconnect"}
            />
          </div>

          <SyncCard status={status} />
        </div>
      )}
    </div>
  );
}
