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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DISCOUNT_TYPE_OPTIONS } from "@/components/coupons/coupon-labels";
import {
  createCoupon,
  updateCoupon,
  type CouponCreateInput,
  type CouponDiscountType,
  type CouponDto,
} from "@/lib/coupons-api";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface CouponFormDialogProps {
  open: boolean;
  /** Null/undefined = create; a coupon = edit. */
  coupon?: CouponDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * The dialog keeps money/limit fields as strings so the inputs can be cleared
 * to represent "unlimited" / "no minimum". They are parsed to numbers (or null)
 * only when building the request body.
 */
interface FormState {
  code: string;
  discountType: CouponDiscountType;
  amount: string;
  description: string;
  dateExpires: string;
  usageLimit: string;
  usageLimitPerUser: string;
  minimumAmount: string;
  maximumAmount: string;
  freeShipping: boolean;
  individualUse: boolean;
  excludeSaleItems: boolean;
}

const EMPTY: FormState = {
  code: "",
  discountType: "percent",
  amount: "",
  description: "",
  dateExpires: "",
  usageLimit: "",
  usageLimitPerUser: "",
  minimumAmount: "",
  maximumAmount: "",
  freeShipping: false,
  individualUse: false,
  excludeSaleItems: false,
};

/** Normalize a backend date (YYYY-MM-DD or full timestamp) for a date input. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

/** Parse an optional numeric field; empty string → null. */
function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Read a boolean restriction flag from the coupon's opaque restrictions bag. */
function readBoolRestriction(
  restrictions: Record<string, unknown> | null,
  key: string,
): boolean {
  return restrictions ? restrictions[key] === true : false;
}

export function CouponFormDialog({
  open,
  coupon,
  onOpenChange,
  onSaved,
}: CouponFormDialogProps) {
  const isEdit = Boolean(coupon);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setForm(
      coupon
        ? {
            code: coupon.code,
            discountType: coupon.discountType,
            amount: coupon.amount ?? "",
            description: coupon.description ?? "",
            dateExpires: toDateInput(coupon.dateExpires),
            usageLimit:
              coupon.usageLimit === null ? "" : String(coupon.usageLimit),
            usageLimitPerUser:
              coupon.usageLimitPerUser === null
                ? ""
                : String(coupon.usageLimitPerUser),
            minimumAmount: "",
            maximumAmount: "",
            freeShipping: coupon.freeShipping,
            individualUse: readBoolRestriction(
              coupon.restrictions,
              "individualUse",
            ),
            excludeSaleItems: readBoolRestriction(
              coupon.restrictions,
              "excludeSaleItems",
            ),
          }
        : EMPTY,
    );
  }, [open, coupon]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const amountValue = Number(form.amount);
  const amountInvalid =
    form.amount.trim() === "" || Number.isNaN(amountValue) || amountValue < 0;
  const codeInvalid = form.code.trim().length === 0;

  async function handleSubmit() {
    if (codeInvalid) {
      setError("كود الكوبون مطلوب.");
      return;
    }
    if (amountInvalid) {
      setError("القيمة مطلوبة ويجب أن تكون رقماً أكبر من أو يساوي صفر.");
      return;
    }

    setSubmitting(true);
    setError(null);

    // Restriction lists (products/categories/emails) are intentionally omitted
    // so the backend preserves whatever the coupon already has on edit.
    const body: CouponCreateInput = {
      code: form.code.trim(),
      discountType: form.discountType,
      amount: amountValue,
      description: form.description.trim() ? form.description.trim() : null,
      freeShipping: form.freeShipping,
      usageLimit: toOptionalNumber(form.usageLimit),
      usageLimitPerUser: toOptionalNumber(form.usageLimitPerUser),
      dateExpires: form.dateExpires.trim() ? form.dateExpires : null,
      minimumAmount: toOptionalNumber(form.minimumAmount),
      maximumAmount: toOptionalNumber(form.maximumAmount),
      individualUse: form.individualUse,
      excludeSaleItems: form.excludeSaleItems,
    };

    try {
      if (coupon) {
        await updateCoupon(coupon.id, body);
      } else {
        await createCoupon(body);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر حفظ الكوبون.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل الكوبون" : "إنشاء كوبون"}</DialogTitle>
          <DialogDescription>
            بيانات كوبون الخصم كما ستظهر في متجر ووردبريس.
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="coupon-code">الكود</Label>
            <Input
              id="coupon-code"
              dir="ltr"
              className="font-mono"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-type">النوع</Label>
            <select
              id="coupon-type"
              className={inputClass}
              value={form.discountType}
              onChange={(e) =>
                set("discountType", e.target.value as CouponDiscountType)
              }
            >
              {DISCOUNT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-amount">القيمة</Label>
            <Input
              id="coupon-amount"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-expires">تنتهي في</Label>
            <Input
              id="coupon-expires"
              type="date"
              dir="ltr"
              value={form.dateExpires}
              onChange={(e) => set("dateExpires", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="coupon-description">الوصف</Label>
            <Textarea
              id="coupon-description"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-usage-limit">حد الاستخدام الإجمالي</Label>
            <Input
              id="coupon-usage-limit"
              type="number"
              min={0}
              step="1"
              dir="ltr"
              placeholder="غير محدود"
              value={form.usageLimit}
              onChange={(e) => set("usageLimit", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-usage-per-user">
              حد الاستخدام لكل عميل
            </Label>
            <Input
              id="coupon-usage-per-user"
              type="number"
              min={0}
              step="1"
              dir="ltr"
              placeholder="غير محدود"
              value={form.usageLimitPerUser}
              onChange={(e) => set("usageLimitPerUser", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-min-amount">الحد الأدنى للسلة</Label>
            <Input
              id="coupon-min-amount"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              placeholder="بدون حد"
              value={form.minimumAmount}
              onChange={(e) => set("minimumAmount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-max-amount">الحد الأقصى للسلة</Label>
            <Input
              id="coupon-max-amount"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              placeholder="بدون حد"
              value={form.maximumAmount}
              onChange={(e) => set("maximumAmount", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <Label htmlFor="coupon-free-shipping" className="cursor-pointer">
              الشحن المجاني
            </Label>
            <Switch
              id="coupon-free-shipping"
              checked={form.freeShipping}
              onCheckedChange={(v) => set("freeShipping", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <Label htmlFor="coupon-individual-use" className="cursor-pointer">
              استخدام فردي (لا يُدمج مع كوبونات أخرى)
            </Label>
            <Switch
              id="coupon-individual-use"
              checked={form.individualUse}
              onCheckedChange={(v) => set("individualUse", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <Label htmlFor="coupon-exclude-sale" className="cursor-pointer">
              استبعاد المنتجات المخفّضة
            </Label>
            <Switch
              id="coupon-exclude-sale"
              checked={form.excludeSaleItems}
              onCheckedChange={(v) => set("excludeSaleItems", v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || codeInvalid || amountInvalid}
          >
            {submitting ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إنشاء"}
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
      </DialogContent>
    </Dialog>
  );
}
