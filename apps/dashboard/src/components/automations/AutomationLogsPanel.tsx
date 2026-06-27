import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { resolveLogStatus } from "@/components/automations/automation-display";
import {
  listAutomationLogs,
  type AutomationLogDto,
} from "@/lib/automations-api";
import { formatDateTime } from "@/lib/utils";

const LOGS_LIMIT = 5;

interface AutomationLogsPanelProps {
  automationId: string;
}

/**
 * Collapsible recent-run logs for one automation. Lazily fetches the latest few
 * logs the first time it is opened. Shared by the classic and digital automation
 * cards so the logs UX stays identical across both sections.
 */
export function AutomationLogsPanel({ automationId }: AutomationLogsPanelProps) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<AutomationLogDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setError(false);
    try {
      const result = await listAutomationLogs(automationId, {
        limit: LOGS_LIMIT,
      });
      setLogs(result.items);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void loadLogs();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={toggle}>
        <History className="h-4 w-4" />
        {open ? "إخفاء السجلات" : "عرض السجلات"}
      </Button>

      {open ? (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            آخر السجلات
          </h4>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ التحميل…
            </div>
          ) : error ? (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>تعذّر تحميل السجلات.</span>
              <Button variant="outline" size="sm" onClick={() => void loadLogs()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
              لا توجد سجلات بعد لهذه الأتمتة.
            </p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log) => {
                const status = resolveLogStatus(log.status);
                return (
                  <li
                    key={log.id}
                    className="flex flex-col gap-1 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge label={status.label} tone={status.tone} />
                      <span className="text-sm">{log.message ?? "—"}</span>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
