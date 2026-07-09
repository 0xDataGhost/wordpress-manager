import { useState } from "react";
import { AlertTriangle, ScaleIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import {
  runReconciliation,
  type ReconcileDomain,
  type ReconcileDomainResult,
  type ReconcileResult,
} from "@/lib/reconciliation-api";

type Props = {
  /** Whether the store is connected; the reconcile action is gated on this. */
  isConnected: boolean;
};

const DOMAIN_LABEL: Record<ReconcileDomain, string> = {
  product: "المنتجات",
  order: "الطلبات",
  customer: "العملاء",
  coupon: "الكوبونات",
  review: "التقييمات",
};

/** Signed-number formatting: "+3" / "-2" / "0". */
function formatDrift(drift: number): string {
  return drift > 0 ? `+${drift}` : String(drift);
}

function rowStatus(row: ReconcileDomainResult): {
  label: string;
  tone: StatusTone;
} {
  if (!row.ok || row.drift === null) {
    return { label: "خطأ", tone: "neutral" };
  }
  if (row.drift === 0) {
    return { label: "متطابق", tone: "success" };
  }
  return { label: "انحراف", tone: "warning" };
}

export function ParityPanel({ isConnected }: Props) {
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReconcile() {
    setRunning(true);
    setError(null);
    try {
      setResult(await runReconciliation());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذّر فحص المطابقة.",
      );
    } finally {
      setRunning(false);
    }
  }

  const hasDrift = (result?.driftedDomains.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>مطابقة البيانات</CardTitle>
        <CardDescription>
          قارن بيانات لوحة التحكم مع ووردبريس واكتشف أي انحراف.
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
          onClick={() => void handleReconcile()}
          disabled={!isConnected || running}
        >
          <ScaleIcon className={running ? "animate-spin" : undefined} />
          {running ? "جارٍ الفحص…" : "فحص المطابقة الآن"}
        </Button>

        {!isConnected ? (
          <p className="text-sm text-muted-foreground">
            اربط المتجر أولًا لتفعيل فحص المطابقة.
          </p>
        ) : null}

        {result ? (
          <div className="space-y-4">
            {hasDrift ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  يوجد انحراف — أعد المزامنة من زر المزامنة اليدوية لتصحيحه.
                </span>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النطاق</TableHead>
                    <TableHead>في اللوحة</TableHead>
                    <TableHead>في ووردبريس</TableHead>
                    <TableHead>الفرق</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.domains.map((row) => {
                    const status = rowStatus(row);
                    return (
                      <TableRow key={row.domain}>
                        <TableCell className="font-medium">
                          {DOMAIN_LABEL[row.domain] ?? row.domain}
                        </TableCell>
                        <TableCell dir="ltr" className="text-start">
                          {row.localCount}
                        </TableCell>
                        <TableCell dir="ltr" className="text-start">
                          {row.remoteCount ?? "—"}
                        </TableCell>
                        <TableCell dir="ltr" className="text-start">
                          {row.drift === null ? (
                            <span className="text-muted-foreground">
                              غير متاح
                            </span>
                          ) : row.drift === 0 ? (
                            <span className="text-success">متطابق</span>
                          ) : (
                            <span className="text-warning">
                              {formatDrift(row.drift)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={status.label} tone={status.tone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-sm text-muted-foreground">
              آخر فحص:{" "}
              <span dir="ltr">{formatDateTime(result.checkedAt)}</span>
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
