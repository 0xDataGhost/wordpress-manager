import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_STATUS_OPTIONS } from "@/components/products/product-status";
import { cn } from "@/lib/utils";

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().or(z.literal(""));

const productFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "اسم المنتج مطلوب (حرفان على الأقل)")
    .max(200, "اسم المنتج طويل جدًا"),
  shortDescription: optionalText(500, "الوصف المختصر طويل جدًا"),
  description: optionalText(5000, "الوصف طويل جدًا"),
  price: z.coerce
    .number({ invalid_type_error: "أدخل سعرًا صحيحًا" })
    .nonnegative("لا يمكن أن يكون السعر سالبًا")
    .max(99_999_999.99, "السعر كبير جدًا"),
  stockQuantity: z.coerce
    .number({ invalid_type_error: "أدخل كمية صحيحة" })
    .int("يجب أن تكون الكمية عددًا صحيحًا")
    .min(0, "لا يمكن أن تكون الكمية سالبة")
    .max(1_000_000, "الكمية كبيرة جدًا"),
  status: z.enum(["draft", "active", "archived"]),
  imageUrl: z
    .string()
    .trim()
    .url("أدخل رابط صورة صحيحًا")
    .max(2048, "الرابط طويل جدًا")
    .optional()
    .or(z.literal("")),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

const DEFAULTS: ProductFormValues = {
  name: "",
  shortDescription: "",
  description: "",
  price: 0,
  stockQuantity: 0,
  status: "draft",
  imageUrl: "",
};

interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { ...DEFAULTS, ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "تعذّر حفظ المنتج.",
      );
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">اسم المنتج</Label>
        <Input id="name" placeholder="مثال: قميص قطني" {...register("name")} />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="shortDescription">وصف مختصر</Label>
        <Input
          id="shortDescription"
          placeholder="سطر واحد يلخّص المنتج"
          {...register("shortDescription")}
        />
        {errors.shortDescription ? (
          <p className="text-xs text-destructive">
            {errors.shortDescription.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">الوصف الكامل</Label>
        <Textarea
          id="description"
          rows={5}
          placeholder="تفاصيل المنتج، المواصفات، المقاسات…"
          {...register("description")}
        />
        {errors.description ? (
          <p className="text-xs text-destructive">
            {errors.description.message}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">السعر</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            {...register("price")}
          />
          {errors.price ? (
            <p className="text-xs text-destructive">{errors.price.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="stockQuantity">الكمية المتوفرة</Label>
          <Input
            id="stockQuantity"
            type="number"
            step="1"
            min="0"
            dir="ltr"
            {...register("stockQuantity")}
          />
          {errors.stockQuantity ? (
            <p className="text-xs text-destructive">
              {errors.stockQuantity.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">الحالة</Label>
          <select
            id="status"
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            )}
            {...register("status")}
          >
            {PRODUCT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.status ? (
            <p className="text-xs text-destructive">{errors.status.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageUrl">رابط الصورة</Label>
          <Input
            id="imageUrl"
            type="url"
            dir="ltr"
            placeholder="https://…"
            {...register("imageUrl")}
          />
          {errors.imageUrl ? (
            <p className="text-xs text-destructive">
              {errors.imageUrl.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
