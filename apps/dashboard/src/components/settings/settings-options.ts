import type { SettingsDateRange } from "@/lib/settings-api";

/** Curated timezones common to Arabic-region stores (validated server-side). */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Riyadh", label: "الرياض (UTC+3)" },
  { value: "Asia/Dubai", label: "دبي (UTC+4)" },
  { value: "Asia/Qatar", label: "الدوحة (UTC+3)" },
  { value: "Asia/Kuwait", label: "الكويت (UTC+3)" },
  { value: "Asia/Baghdad", label: "بغداد (UTC+3)" },
  { value: "Asia/Amman", label: "عمّان (UTC+3)" },
  { value: "Africa/Cairo", label: "القاهرة (UTC+2)" },
  { value: "Africa/Casablanca", label: "الدار البيضاء (UTC+1)" },
  { value: "Europe/Istanbul", label: "إسطنبول (UTC+3)" },
  { value: "UTC", label: "التوقيت العالمي (UTC)" },
];

/** Dashboard default date-range presets (Arabic labels). */
export const DATE_RANGE_OPTIONS: { value: SettingsDateRange; label: string }[] =
  [
    { value: "today", label: "اليوم" },
    { value: "7d", label: "آخر ٧ أيام" },
    { value: "30d", label: "آخر ٣٠ يومًا" },
    { value: "this_month", label: "هذا الشهر" },
  ];
