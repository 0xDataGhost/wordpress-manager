import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fetchSyncStatus, triggerSync, type SyncJobDto } from "@/lib/sync-api";
import { formatDateTime } from "@/lib/utils";
import type { ConnectionStatusDto } from "@/lib/connector-api";

type Props = {
  status: ConnectionStatusDto;
};

const ENTITY_LABEL: Record<string, string> = {
  product: "المنتجات",
  order: "الطلبات",
  customer: "العملاء",
  all: "الكل",
};

const STATUS_META: Record<
  SyncJobDto["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  completed: { label: "اكتملت", tone: "success" },
  running: { label: "جارية", tone: "warning" },
  queued: { label: "في الانتظار", tone: "neutral" },
  failed: { label: "فشلت", tone: "danger" },
};

export function SyncCard({ status }: Props) {
  const [jobs, setJobs] = useState<SyncJobDto[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConnected = status.status === "connected";

  const loadStatus = useCallback(async () => {
    try {
      setJobs(await fetchSyncStatus());
    } catch {
      // Status history is best-effort; the sync action surfaces its own errors.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await triggerSync("all");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّرت المزامنة.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>مزامنة ووكومرس</CardTitle>
        <CardDescription>
          اسحب المنتجات والطلبات والعملاء من متجر ووكومرس إلى لوحة التحكم. المزامنة
          المتكررة تُحدّث السجلات الموجودة ولا تكررها.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={() => void handleSync()}
          disabled={!isConnected || syncing}
        >
          <RefreshCw className={syncing ? "animate-spin" : undefined} />
          {syncing ? "جارٍ المزامنة…" : "مزامنة الآن"}
        </Button>

        {!isConnected ? (
          <p className="text-sm text-muted-foreground">
            اربط المتجر أولًا لتفعيل المزامنة.
          </p>
        ) : null}

        {jobs.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">آخر عمليات المزامنة</h3>
            <ul className="space-y-2">
              {jobs.slice(0, 5).map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {ENTITY_LABEL[job.entityType] ?? job.entityType}
                  </span>
                  <StatusBadge
                    label={STATUS_META[job.status].label}
                    tone={STATUS_META[job.status].tone}
                  />
                  <span className="text-muted-foreground">
                    أُضيف {job.createdCount} · حُدّث {job.updatedCount}
                  </span>
                  <span className="text-muted-foreground" dir="ltr">
                    {formatDateTime(job.finishedAt ?? job.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
