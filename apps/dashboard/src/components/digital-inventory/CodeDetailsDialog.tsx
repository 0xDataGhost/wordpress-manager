import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { resolveCodeStatus } from "@/components/digital-inventory/digital-code-status";
import { getCode, type CodeDetails } from "@/lib/digital-inventory-api";
import { formatDateTime } from "@/lib/utils";

interface CodeDetailsDialogProps {
  /** Code id to show, or null when closed. */
  codeId: string | null;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * Read-only details for one code. Shows only masked, non-secret fields — the full
 * code is never fetched or shown here (use the reveal action for that).
 */
export function CodeDetailsDialog({
  codeId,
  onOpenChange,
}: CodeDetailsDialogProps) {
  const open = codeId !== null;
  const [details, setDetails] = useState<CodeDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !codeId) {
      setDetails(null);
      setError(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    getCode(codeId)
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, codeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تفاصيل الكود</DialogTitle>
        </DialogHeader>

        {loading ? (
          <LoadingState />
        ) : error || !details ? (
          <ErrorState description="تعذّر تحميل تفاصيل الكود." />
        ) : (
          <div>
            <Row label="المنتج">{details.productName ?? "—"}</Row>
            <Row label="الدفعة">{details.batchName ?? "—"}</Row>
            <Row label="معاينة الكود">
              <span dir="ltr" className="font-mono">
                {details.codePreview ?? "—"}
              </span>
            </Row>
            <Row label="الحالة">
              <StatusBadge
                label={resolveCodeStatus(details.status).label}
                tone={resolveCodeStatus(details.status).tone}
              />
            </Row>
            <Row label="التكلفة">
              {details.costPrice ? (
                <span dir="ltr">
                  {details.costPrice} {details.currency ?? ""}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="تاريخ الانتهاء">
              {details.expiresAt ? formatDateTime(details.expiresAt) : "—"}
            </Row>
            <Row label="تاريخ الإضافة">{formatDateTime(details.createdAt)}</Row>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
