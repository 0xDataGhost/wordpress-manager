import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  createVariation,
  deleteVariation,
  type CatalogProductStatus,
  type VariationDto,
  type VariationInput,
} from "@/lib/catalog-api";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const STATUS_OPTIONS: { value: CatalogProductStatus; label: string }[] = [
  { value: "publish", label: "منشور" },
  { value: "private", label: "خاص" },
];

type AttrRow = { id: number; key: string; value: string };

type ProductVariationsSectionProps = {
  productId: string;
  /** Surface a status message on the parent page. */
  onMessage: (tone: "success" | "error", message: string) => void;
};

let attrRowSeq = 0;
function newAttrRow(): AttrRow {
  attrRowSeq += 1;
  return { id: attrRowSeq, key: "", value: "" };
}

export function ProductVariationsSection({
  productId,
  onMessage,
}: ProductVariationsSectionProps) {
  // Variations created during this session — there is no GET list endpoint,
  // so we track what we create so the user can delete them without a reload.
  const [variations, setVariations] = useState<VariationDto[]>([]);

  const [open, setOpen] = useState(false);
  const [regularPrice, setRegularPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [status, setStatus] = useState<CatalogProductStatus>("publish");
  const [attrs, setAttrs] = useState<AttrRow[]>([newAttrRow()]);
  const [creating, setCreating] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<VariationDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  function resetForm() {
    setRegularPrice("");
    setSalePrice("");
    setStockQuantity("");
    setStatus("publish");
    setAttrs([newAttrRow()]);
    setDialogError(null);
  }

  function buildAttributes(): Record<string, string> | undefined {
    const entries = attrs
      .map((row) => [row.key.trim(), row.value.trim()] as const)
      .filter(([key, value]) => key !== "" && value !== "");
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
  }

  async function handleCreate() {
    setCreating(true);
    setDialogError(null);
    try {
      const input: VariationInput = {
        regularPrice: regularPrice ? Number(regularPrice) : undefined,
        salePrice: salePrice ? Number(salePrice) : undefined,
        stockQuantity: stockQuantity ? Number(stockQuantity) : undefined,
        status,
        attributes: buildAttributes(),
      };
      const created = await createVariation(productId, input);
      setVariations((prev) => [...prev, created]);
      setOpen(false);
      resetForm();
      onMessage("success", "تمت إضافة المتغيّر بنجاح.");
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "تعذّرت إضافة المتغيّر. حاول مرة أخرى.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVariation(productId, deleteTarget.wpVariationId);
      setVariations((prev) =>
        prev.filter((v) => v.wpVariationId !== deleteTarget.wpVariationId),
      );
      setDeleteTarget(null);
      onMessage("success", "تم حذف المتغيّر.");
    } catch (err) {
      onMessage(
        "error",
        err instanceof Error ? err.message : "تعذّر حذف المتغيّر.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>المتغيّرات</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          إضافة متغيّر
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {variations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            المتغيّرات التي تنشئها في هذه الجلسة ستظهر هنا. لعرض كل المتغيّرات
            الحالية راجع المنتج في ووكومرس.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {variations.map((variation) => (
              <li
                key={variation.wpVariationId}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-col gap-1">
                  <span dir="ltr" className="text-sm font-medium">
                    #{variation.wpVariationId}
                  </span>
                  <span
                    dir="ltr"
                    className="text-xs text-muted-foreground"
                  >
                    {variation.regularPrice ?? "—"}
                    {variation.salePrice ? ` / ${variation.salePrice}` : ""} ·{" "}
                    {variation.stockQuantity ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={
                      variation.status === "publish" ? "منشور" : variation.status
                    }
                    tone={variation.status === "publish" ? "success" : "neutral"}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف المتغيّر"
                    onClick={() => setDeleteTarget(variation)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة متغيّر</DialogTitle>
            <DialogDescription>
              أدخل بيانات المتغيّر. الحقول الفارغة تُترك دون تغيير.
            </DialogDescription>
          </DialogHeader>

          {dialogError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {dialogError}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="var-regular">السعر العادي</Label>
                <Input
                  id="var-regular"
                  dir="ltr"
                  type="number"
                  inputMode="decimal"
                  value={regularPrice}
                  onChange={(e) => setRegularPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-sale">سعر التخفيض</Label>
                <Input
                  id="var-sale"
                  dir="ltr"
                  type="number"
                  inputMode="decimal"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-stock">الكمية</Label>
                <Input
                  id="var-stock"
                  dir="ltr"
                  type="number"
                  inputMode="numeric"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-status">الحالة</Label>
                <select
                  id="var-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as CatalogProductStatus)
                  }
                  className={selectClass}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الخصائص</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAttrs((prev) => [...prev, newAttrRow()])}
                >
                  <Plus className="h-4 w-4" />
                  خاصية
                </Button>
              </div>
              <div className="space-y-2">
                {attrs.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) =>
                        setAttrs((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, key: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder="الاسم"
                      aria-label="اسم الخاصية"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) =>
                        setAttrs((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? { ...r, value: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="القيمة"
                      aria-label="قيمة الخاصية"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="إزالة الخاصية"
                      onClick={() =>
                        setAttrs((prev) =>
                          prev.length > 1
                            ? prev.filter((r) => r.id !== row.id)
                            : [newAttrRow()],
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? "جارٍ الإنشاء…" : "إنشاء"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={creating}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="حذف المتغيّر"
        description={
          deleteTarget
            ? `سيتم حذف المتغيّر رقم #${deleteTarget.wpVariationId} من ووكومرس.`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </Card>
  );
}
