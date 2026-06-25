import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revealCode } from "@/lib/digital-inventory-api";

const COPIED_RESET_MS = 2000;

interface RevealTarget {
  id: string;
  codePreview: string | null;
}

interface RevealCodeDialogProps {
  /** The code to reveal, or null when the dialog is closed. */
  target: RevealTarget | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Securely reveals a single code's full plaintext.
 *
 * The raw code is shown ONLY after an explicit "reveal" click (which calls the
 * audited backend endpoint), and is held in local state for no longer than the
 * dialog is open — it is cleared on every close so it never lingers in memory or
 * survives navigation. The user is warned the action is recorded in the audit log.
 */
export function RevealCodeDialog({
  target,
  onOpenChange,
}: RevealCodeDialogProps) {
  const open = target !== null;
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Clear the revealed plaintext (and all transient state) whenever the dialog
  // closes or the target changes — never cache it beyond the modal's lifetime.
  useEffect(() => {
    if (!open) {
      setCode(null);
      setError(null);
      setLoading(false);
      setCopied(false);
    }
  }, [open, target?.id]);

  async function handleReveal() {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const result = await revealCode(target.id);
      setCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر كشف الكود.");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>كشف الكود</DialogTitle>
          <DialogDescription>
            معاينة الكود:{" "}
            <span dir="ltr" className="font-mono">
              {target?.codePreview ?? "—"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            سيتم تسجيل عملية الكشف في سجلّ التدقيق. اكشف الكود فقط عند الحاجة، ولا
            تشاركه إلا عبر القنوات المعتمدة.
          </span>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        {code !== null ? (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              dir="ltr"
              value={code}
              className="font-mono text-sm"
              onFocus={(event) => event.currentTarget.select()}
              aria-label="الكود الكامل"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyCode}
              aria-label="نسخ الكود"
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          {code === null ? (
            <Button type="button" onClick={() => void handleReveal()} disabled={loading}>
              <Eye className="h-4 w-4" />
              {loading ? "جارٍ الكشف…" : "كشف الكود الكامل"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
