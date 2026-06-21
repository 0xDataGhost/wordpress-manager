import type { StatusTone } from "@/components/shared/StatusBadge";
import type { ProductStatus } from "@/lib/products-api";

interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/** Arabic label + badge tone for each product status. */
export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  draft: { label: "مسودة", tone: "neutral" },
  active: { label: "نشط", tone: "success" },
  archived: { label: "مؤرشف", tone: "warning" },
};

/** Ordered options for the status select control. */
export const PRODUCT_STATUS_OPTIONS: { value: ProductStatus; label: string }[] =
  [
    { value: "draft", label: PRODUCT_STATUS_META.draft.label },
    { value: "active", label: PRODUCT_STATUS_META.active.label },
    { value: "archived", label: PRODUCT_STATUS_META.archived.label },
  ];
