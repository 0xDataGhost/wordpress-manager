/**
 * Field metadata for the store-settings groups (Phase 30).
 *
 * The backend allowlists a fixed set of keys per group and stores WooCommerce
 * booleans as the strings "yes"/"no". This module declares, per key, its Arabic
 * label, the input type to render, and (for selects) the option list — so the
 * generic group form can render/validate/serialize without special-casing.
 *
 * Only keys listed here are ever sent on save, which naturally keeps requests
 * within the backend allowlist.
 */

import type { SettingValue } from "@/lib/store-config-api";

/** How the group form should render a given key. */
export type FieldKind = "text" | "number" | "boolean" | "select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** For "select": the allowed options. */
  options?: SelectOption[];
  /** Optional hint rendered under the field. */
  hint?: string;
  /** Force LTR + monospace-ish alignment (codes, separators). */
  ltr?: boolean;
}

// --- Shared enum option lists -------------------------------------------------

/** A conservative currency list covering the store's active markets. */
const CURRENCY_OPTIONS: SelectOption[] = [
  { value: "SAR", label: "ريال سعودي (SAR)" },
  { value: "AED", label: "درهم إماراتي (AED)" },
  { value: "EGP", label: "جنيه مصري (EGP)" },
  { value: "USD", label: "دولار أمريكي (USD)" },
  { value: "EUR", label: "يورو (EUR)" },
  { value: "KWD", label: "دينار كويتي (KWD)" },
  { value: "QAR", label: "ريال قطري (QAR)" },
  { value: "BHD", label: "دينار بحريني (BHD)" },
  { value: "OMR", label: "ريال عُماني (OMR)" },
  { value: "JOD", label: "دينار أردني (JOD)" },
];

const CURRENCY_POS_OPTIONS: SelectOption[] = [
  { value: "left", label: "يسار (رمز ثم المبلغ)" },
  { value: "right", label: "يمين (المبلغ ثم رمز)" },
  { value: "left_space", label: "يسار مع مسافة" },
  { value: "right_space", label: "يمين مع مسافة" },
];

const WEIGHT_UNIT_OPTIONS: SelectOption[] = [
  { value: "kg", label: "كيلوغرام (kg)" },
  { value: "g", label: "غرام (g)" },
  { value: "lbs", label: "رطل (lbs)" },
  { value: "oz", label: "أونصة (oz)" },
];

const DIMENSION_UNIT_OPTIONS: SelectOption[] = [
  { value: "cm", label: "سنتيمتر (cm)" },
  { value: "m", label: "متر (m)" },
  { value: "mm", label: "مليمتر (mm)" },
  { value: "in", label: "إنش (in)" },
  { value: "yd", label: "ياردة (yd)" },
];

const TAX_BASED_ON_OPTIONS: SelectOption[] = [
  { value: "shipping", label: "عنوان الشحن" },
  { value: "billing", label: "عنوان الفوترة" },
  { value: "base", label: "عنوان المتجر الأساسي" },
];

const TAX_DISPLAY_OPTIONS: SelectOption[] = [
  { value: "incl", label: "شاملة الضريبة" },
  { value: "excl", label: "غير شاملة الضريبة" },
];

// --- Group field specs --------------------------------------------------------

export const GENERAL_FIELDS: FieldSpec[] = [
  { key: "woocommerce_store_address", label: "عنوان المتجر", kind: "text" },
  {
    key: "woocommerce_store_address_2",
    label: "عنوان المتجر (سطر ٢)",
    kind: "text",
  },
  { key: "woocommerce_store_city", label: "المدينة", kind: "text" },
  { key: "woocommerce_store_postcode", label: "الرمز البريدي", kind: "text", ltr: true },
  {
    key: "woocommerce_default_country",
    label: "الدولة الافتراضية",
    kind: "text",
    ltr: true,
    hint: "رمز الدولة (مثال: SA أو SA:01).",
  },
  {
    key: "woocommerce_currency",
    label: "العملة الأساسية",
    kind: "select",
    options: CURRENCY_OPTIONS,
  },
  {
    key: "woocommerce_currency_pos",
    label: "موضع رمز العملة",
    kind: "select",
    options: CURRENCY_POS_OPTIONS,
  },
  {
    key: "woocommerce_price_thousand_sep",
    label: "فاصل الآلاف",
    kind: "text",
    ltr: true,
  },
  {
    key: "woocommerce_price_decimal_sep",
    label: "الفاصل العشري",
    kind: "text",
    ltr: true,
  },
  {
    key: "woocommerce_price_num_decimals",
    label: "عدد المنازل العشرية",
    kind: "number",
    ltr: true,
  },
];

export const PRODUCTS_FIELDS: FieldSpec[] = [
  {
    key: "woocommerce_weight_unit",
    label: "وحدة الوزن",
    kind: "select",
    options: WEIGHT_UNIT_OPTIONS,
  },
  {
    key: "woocommerce_dimension_unit",
    label: "وحدة الأبعاد",
    kind: "select",
    options: DIMENSION_UNIT_OPTIONS,
  },
  { key: "woocommerce_enable_reviews", label: "تفعيل التقييمات", kind: "boolean" },
  { key: "woocommerce_manage_stock", label: "إدارة المخزون", kind: "boolean" },
  {
    key: "woocommerce_notify_low_stock_amount",
    label: "حد التنبيه لانخفاض المخزون",
    kind: "number",
    ltr: true,
  },
  {
    key: "woocommerce_hide_out_of_stock_items",
    label: "إخفاء المنتجات غير المتوفرة",
    kind: "boolean",
  },
];

/** Tax *settings* group (display + calculation). Tax *rates* live separately. */
export const TAX_FIELDS: FieldSpec[] = [
  { key: "woocommerce_calc_taxes", label: "احتساب الضرائب", kind: "boolean" },
  {
    key: "woocommerce_prices_include_tax",
    label: "الأسعار تشمل الضريبة",
    kind: "boolean",
  },
  {
    key: "woocommerce_tax_based_on",
    label: "احتساب الضريبة بناءً على",
    kind: "select",
    options: TAX_BASED_ON_OPTIONS,
  },
  {
    key: "woocommerce_tax_display_shop",
    label: "عرض الأسعار في المتجر",
    kind: "select",
    options: TAX_DISPLAY_OPTIONS,
  },
  {
    key: "woocommerce_tax_display_cart",
    label: "عرض الأسعار في السلة",
    kind: "select",
    options: TAX_DISPLAY_OPTIONS,
  },
];

/** The one key that demands an explicit confirmation before it is submitted. */
export const CURRENCY_KEY = "woocommerce_currency";

// --- WooCommerce yes/no <-> boolean conversion --------------------------------

/** WooCommerce persists booleans as the strings "yes"/"no". */
export function wooBoolToChecked(value: SettingValue | undefined): boolean {
  if (typeof value === "boolean") return value;
  return value === "yes" || value === "1" || value === 1;
}

export function checkedToWooBool(checked: boolean): string {
  return checked ? "yes" : "no";
}
