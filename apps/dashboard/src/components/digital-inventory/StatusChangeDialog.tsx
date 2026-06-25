import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getManualStatusTargets,
  MANUAL_STATUS_TARGET_LABELS,
} from "@/components/digital-inventory/digital-code-status";
import {
  updateCodeStatus,
  type CodeDetails,
  type ManualStatusTarget,
} from "@/lib/digital-inventory-api";
import { cn } from "@/lib/utils";

interface StatusTarget {
  id: string;
  status: string;
  codePreview: string | null;
}

interface StatusChangeDialogProps {
  target: StatusTarget | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (code: CodeDetails) => void;
}

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Changes a code's status to a destructive state (void / invalid / expire). The
 * allowed targets depend on the current status (mirrors the backend, which
 * re-validates). A reason is always required for these destructive transitions.
 */
export function StatusChangeDialog({
  target,
  onOpenChange,
  onUpdated,
}: StatusChangeDialogProps) {
  const open = target !== null;
  const allowed = target ? getManualStatusTargets(target.status) : [];

  const [status, setStatus] = useState<ManualStatusTarget | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form to the first allowed target each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStatus(allowed[0] ?? "");
      setReason("");
      setError(null);
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  async function handleSubmit() {
    if (!target || status === "") return;
    if (reason.trim().length < 3) {
      setError("السبب مطلوب (٣ أحرف على الأقل).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateCodeStatus(target.id, {
        status,
        reason: reason.trim(),
      });
      onUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحديث الحالة.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير حالة الكود</DialogTitle>
          <DialogDescription>
            معاينة الكود:{" "}
            <span dir="ltr" className="font-mono">
              {target?.codePreview ?? "—"}
            </span>
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="status">الحالة الجديدة</Label>
          <select
            id="status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as ManualStatusTarget)}
          >
            {allowed.map((value) => (
              <option key={value} value={value}>
                {MANUAL_STATUS_TARGET_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">السبب</Label>
          <Textarea
            id="reason"
            rows={3}
            placeholder="مثال: أبلغ المورد أن هذا الكود غير صالح"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            السبب إلزامي للحالات الإتلافية ويُسجَّل مع الإجراء.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            className={cn(submitting && "pointer-events-none")}
            onClick={() => void handleSubmit()}
            disabled={submitting || status === "" || reason.trim().length < 3}
          >
            {submitting ? "جارٍ الحفظ…" : "تحديث الحالة"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
