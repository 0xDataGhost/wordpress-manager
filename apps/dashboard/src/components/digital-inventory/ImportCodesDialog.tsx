import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  importCodes,
  type ImportResult,
} from "@/lib/digital-inventory-api";
import type { ProductDto } from "@/lib/products-api";
import type { SupplierListItem } from "@/lib/suppliers-api";

interface ImportCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductDto[];
  /** Active suppliers for the optional supplier selector (empty = hidden). */
  suppliers?: SupplierListItem[];
  /** Called after a successful import so the page can refresh its data. */
  onImported: () => void;
}

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Import-codes dialog. Codes are pasted one-per-line and sent as raw text to the
 * audited import endpoint, which encrypts them server-side — no code is stored or
 * echoed here. After import, a summary of received/inserted/duplicate/invalid
 * counts is shown.
 */
export function ImportCodesDialog({
  open,
  onOpenChange,
  products,
  suppliers = [],
  onImported,
}: ImportCodesDialogProps) {
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [codesText, setCodesText] = useState("");
  const [costPerCode, setCostPerCode] = useState("");
  const [currency, setCurrency] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Reset everything whenever the dialog opens fresh.
  useEffect(() => {
    if (open) {
      setProductId("");
      setSupplierId("");
      setBatchName("");
      setCodesText("");
      setCostPerCode("");
      setCurrency("");
      setExpiresAt("");
      setNotes("");
      setSubmitting(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!productId) {
      setError("يرجى اختيار المنتج.");
      return;
    }
    if (codesText.trim() === "") {
      setError("يرجى إدخال كود واحد على الأقل.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const parsedCost = costPerCode.trim() === "" ? undefined : Number(costPerCode);
      const imported = await importCodes({
        productId,
        supplierId: supplierId || undefined,
        batchName: batchName.trim() || undefined,
        codesText,
        costPerCode:
          parsedCost !== undefined && !Number.isNaN(parsedCost)
            ? parsedCost
            : undefined,
        currency: currency.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        notes: notes.trim() || undefined,
      });
      setResult(imported);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر استيراد الأكواد.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>استيراد أكواد</DialogTitle>
          <DialogDescription>
            ألصق الأكواد، كل كود في سطر. تُشفَّر الأكواد على الخادم ولا تُخزَّن أو
            تُعرض كنص خام.
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

        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">اكتمل الاستيراد:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ResultStat label="تم استلام" value={result.received} />
              <ResultStat label="تم إضافة" value={result.inserted} tone="success" />
              <ResultStat label="مكرر داخل الملف" value={result.duplicatesInFile} />
              <ResultStat
                label="مكرر موجود مسبقاً"
                value={result.duplicatesExisting}
              />
              <ResultStat label="غير صالح" value={result.invalid} tone="danger" />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                تم
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-product">المنتج</Label>
              <select
                id="import-product"
                className={inputClass}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— اختر المنتج —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {suppliers.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="import-supplier">المورد (اختياري)</Label>
                <select
                  id="import-supplier"
                  className={inputClass}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— بدون مورد —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="import-batch-name">اسم الدفعة</Label>
              <Input
                id="import-batch-name"
                placeholder="مثال: دفعة المورد - يونيو"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-codes">الأكواد (كل كود في سطر)</Label>
              <Textarea
                id="import-codes"
                dir="ltr"
                rows={8}
                className="font-mono text-sm"
                placeholder={"CODE-1\nCODE-2\nCODE-3"}
                value={codesText}
                onChange={(e) => setCodesText(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="import-cost">تكلفة الكود</Label>
                <Input
                  id="import-cost"
                  type="number"
                  step="0.0001"
                  min="0"
                  dir="ltr"
                  placeholder="0.00"
                  value={costPerCode}
                  onChange={(e) => setCostPerCode(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-currency">العملة</Label>
                <Input
                  id="import-currency"
                  dir="ltr"
                  placeholder="USD"
                  maxLength={8}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-expires">تاريخ الانتهاء</Label>
                <Input
                  id="import-expires"
                  type="date"
                  dir="ltr"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-notes">ملاحظات</Label>
              <Textarea
                id="import-notes"
                rows={2}
                placeholder="ملاحظات اختيارية عن هذه الدفعة"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                <Upload className="h-4 w-4" />
                {submitting ? "جارٍ الاستيراد…" : "استيراد"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "success"
            ? "text-lg font-bold text-success"
            : tone === "danger" && value > 0
              ? "text-lg font-bold text-destructive"
              : "text-lg font-bold"
        }
      >
        {value}
      </p>
    </div>
  );
}
