import { RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { cn, formatDateTime } from "@/lib/utils";
import type { ConnectionStatus, ConnectionStatusDto } from "@/lib/connector-api";

const STATUS_VIEW: Record<ConnectionStatus, { label: string; tone: StatusTone }> = {
  disconnected: { label: "غير مربوط", tone: "neutral" },
  pending: { label: "بانتظار التأكيد", tone: "warning" },
  connected: { label: "مربوط", tone: "success" },
};

function healthView(status: ConnectionStatusDto): { label: string; dot: string } {
  if (status.lastHealthStatus === "ok") return { label: "سليم", dot: "bg-success" };
  if (status.lastHealthStatus === "failed")
    return { label: "فشل", dot: "bg-destructive" };
  return { label: "لم يُفحص بعد", dot: "bg-muted-foreground/40" };
}

type Props = {
  status: ConnectionStatusDto;
  onRefresh: () => void;
  refreshing: boolean;
};

export function ConnectionStatusCard({
  status,
  onRefresh,
  refreshing,
}: Props) {
  const view = STATUS_VIEW[status.status];
  const health = healthView(status);
  const isConnected = status.status === "connected";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>حالة الاتصال</CardTitle>
          <CardDescription>حالة ربط متجرك بلوحة التحكم.</CardDescription>
        </div>
        <StatusBadge label={view.label} tone={view.tone} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">المؤشر الصحي</span>
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <span className={cn("h-2.5 w-2.5 rounded-full", health.dot)} />
              {health.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">آخر فحص صحي</span>
            <span className="text-sm font-medium">
              {formatDateTime(status.lastHealthCheckAt)}
            </span>
          </div>
        </div>

        {isConnected ? (
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <MetaRow term="رابط المتجر" value={status.siteUrl} ltr />
            <MetaRow term="آخر ربط" value={formatDateTime(status.lastConnectedAt)} />
            <MetaRow term="إصدار ووردبريس" value={status.wpVersion} ltr />
            <MetaRow term="إصدار ووكومرس" value={status.wcVersion} ltr />
            <MetaRow term="إصدار الموصّل" value={status.connectorVersion} ltr />
            <MetaRow term="معرّف المفتاح" value={status.apiKeyPrefix} ltr />
          </dl>
        ) : null}

        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          تحديث الحالة
        </Button>
      </CardContent>
    </Card>
  );
}

function MetaRow({
  term,
  value,
  ltr,
}: {
  term: string;
  value: string | null;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed py-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="truncate text-sm font-medium" dir={ltr ? "ltr" : undefined}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
