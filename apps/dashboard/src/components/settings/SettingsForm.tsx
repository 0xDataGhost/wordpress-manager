import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DATE_RANGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from "@/components/settings/settings-options";
import { updateSettings, type SettingsDto } from "@/lib/settings-api";
import { cn } from "@/lib/utils";

const settingsFormSchema = z.object({
  general: z.object({
    store_name: z.string().trim().max(200, "الاسم طويل جدًا"),
    company_name: z.string().trim().max(200, "الاسم طويل جدًا"),
    support_email: z
      .string()
      .trim()
      .email("بريد إلكتروني غير صالح")
      .max(200)
      .or(z.literal("")),
    support_phone: z.string().trim().max(40, "رقم الهاتف طويل جدًا"),
    timezone: z.string().min(1, "المنطقة الزمنية مطلوبة"),
  }),
  notifications: z.object({
    enable_low_stock_notifications: z.boolean(),
    enable_daily_reports: z.boolean(),
    enable_failed_sync_notifications: z.boolean(),
  }),
  dashboard: z.object({
    default_date_range: z.enum(["today", "7d", "30d", "this_month"]),
    dashboard_refresh_interval: z.coerce
      .number({ invalid_type_error: "أدخل رقمًا صحيحًا" })
      .int("يجب أن يكون عددًا صحيحًا")
      .min(0, "لا يمكن أن يكون سالبًا")
      .max(3600, "الحد الأقصى ٣٦٠٠ ثانية"),
  }),
  branding: z.object({
    logo_url: z
      .string()
      .trim()
      .url("رابط غير صالح")
      .max(2048)
      .refine(
        (v) => /^https?:\/\//i.test(v),
        "يجب أن يبدأ الرابط بـ http أو https",
      )
      .or(z.literal("")),
    primary_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "لون غير صالح (مثال: ‎#1a2b3c)"),
  }),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type Banner = { tone: "success" | "error"; message: string };

function toFormValues(s: SettingsDto): SettingsFormValues {
  return {
    general: {
      store_name: s.general.store_name,
      company_name: s.general.company_name,
      support_email: s.general.support_email ?? "",
      support_phone: s.general.support_phone ?? "",
      timezone: s.general.timezone,
    },
    notifications: { ...s.notifications },
    dashboard: { ...s.dashboard },
    branding: {
      logo_url: s.branding.logo_url ?? "",
      primary_color: s.branding.primary_color,
    },
  };
}

interface SettingsFormProps {
  settings: SettingsDto;
  canEdit: boolean;
  onSaved: (updated: SettingsDto) => void;
}

export function SettingsForm({ settings, canEdit, onSaved }: SettingsFormProps) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: toFormValues(settings),
  });

  const primaryColor = watch("branding.primary_color");

  const submit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      // The backend coalesces blank email/phone/logo to null.
      const updated = await updateSettings(values);
      onSaved(updated);
      reset(toFormValues(updated));
      setBanner({ tone: "success", message: "تم حفظ الإعدادات بنجاح." });
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error ? error.message : "تعذّر حفظ الإعدادات.",
      });
    }
  });

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {banner ? (
        <div
          role="alert"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            banner.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {banner.message}
        </div>
      ) : null}

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle>الإعدادات العامة</CardTitle>
          <CardDescription>اسم المتجر وبيانات التواصل والمنطقة الزمنية.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="اسم المتجر" error={errors.general?.store_name?.message}>
            <Input disabled={!canEdit} {...register("general.store_name")} />
          </Field>
          <Field label="اسم الشركة" error={errors.general?.company_name?.message}>
            <Input disabled={!canEdit} {...register("general.company_name")} />
          </Field>
          <Field
            label="البريد الإلكتروني للدعم"
            error={errors.general?.support_email?.message}
          >
            <Input
              type="email"
              dir="ltr"
              placeholder="support@store.com"
              disabled={!canEdit}
              {...register("general.support_email")}
            />
          </Field>
          <Field
            label="هاتف الدعم"
            error={errors.general?.support_phone?.message}
          >
            <Input
              dir="ltr"
              placeholder="+9665XXXXXXXX"
              disabled={!canEdit}
              {...register("general.support_phone")}
            />
          </Field>
          <Field
            label="المنطقة الزمنية"
            error={errors.general?.timezone?.message}
          >
            <select
              className={inputClass}
              disabled={!canEdit}
              {...register("general.timezone")}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>إعدادات الإشعارات</CardTitle>
          <CardDescription>تحكّم في أنواع الإشعارات التي يتلقّاها متجرك.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <ToggleRow
            control={control}
            name="notifications.enable_low_stock_notifications"
            label="إشعارات انخفاض المخزون"
            disabled={!canEdit}
          />
          <ToggleRow
            control={control}
            name="notifications.enable_daily_reports"
            label="التقارير اليومية"
            disabled={!canEdit}
          />
          <ToggleRow
            control={control}
            name="notifications.enable_failed_sync_notifications"
            label="إشعارات فشل المزامنة"
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      {/* Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>إعدادات لوحة التحكم</CardTitle>
          <CardDescription>النطاق الزمني الافتراضي وفاصل تحديث البيانات.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="النطاق الزمني الافتراضي"
            error={errors.dashboard?.default_date_range?.message}
          >
            <select
              className={inputClass}
              disabled={!canEdit}
              {...register("dashboard.default_date_range")}
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="فاصل التحديث (بالثواني)"
            error={errors.dashboard?.dashboard_refresh_interval?.message}
          >
            <Input
              type="number"
              min={0}
              max={3600}
              dir="ltr"
              disabled={!canEdit}
              {...register("dashboard.dashboard_refresh_interval")}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>إعدادات الهوية</CardTitle>
          <CardDescription>شعار المتجر واللون الأساسي. (رابط الشعار فقط — لا رفع ملفات.)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="رابط الشعار"
            error={errors.branding?.logo_url?.message}
          >
            <Input
              type="url"
              dir="ltr"
              placeholder="https://…/logo.png"
              disabled={!canEdit}
              {...register("branding.logo_url")}
            />
          </Field>
          <Field
            label="اللون الأساسي"
            error={errors.branding?.primary_color?.message}
          >
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-background disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canEdit}
                {...register("branding.primary_color")}
              />
              <span dir="ltr" className="text-sm text-muted-foreground">
                {primaryColor}
              </span>
            </div>
          </Field>
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            <Save className="h-4 w-4" />
            {isSubmitting ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
          </Button>
        </div>
      ) : (
        <p className="text-end text-xs text-muted-foreground">
          العرض فقط — تحتاج صلاحية «تعديل الإعدادات» لحفظ التغييرات.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ToggleRow({
  control,
  name,
  label,
  disabled,
}: {
  control: import("react-hook-form").Control<SettingsFormValues>;
  name:
    | "notifications.enable_low_stock_notifications"
    | "notifications.enable_daily_reports"
    | "notifications.enable_failed_sync_notifications";
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={disabled}
            aria-label={label}
          />
        )}
      />
    </div>
  );
}
