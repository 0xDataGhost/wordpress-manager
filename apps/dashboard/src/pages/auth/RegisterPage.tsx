import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
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
import { useAuth } from "@/components/auth/AuthProvider";
import { ApiError } from "@/lib/http";

const schema = z
  .object({
    name: z.string().min(2, "الاسم مطلوب"),
    storeName: z.string().min(2, "اسم المتجر مطلوب"),
    email: z
      .string()
      .min(1, "البريد الإلكتروني مطلوب")
      .email("صيغة البريد الإلكتروني غير صحيحة"),
    password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف"),
    confirmPassword: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      storeName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signUp({
        email: values.email,
        password: values.password,
        fullName: values.name,
        storeName: values.storeName,
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "تعذّر إنشاء الحساب. تحقق من اتصالك وحاول مرة أخرى.";
      setError("root", { message });
    }
  });

  return (
    <Card className="shadow-xl shadow-black/5">
      <CardHeader>
        <CardTitle>إنشاء متجر جديد</CardTitle>
        <CardDescription>
          سجّل حسابك وابدأ بإدارة متجرك خلال دقائق
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {errors.root ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.root.message}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">الاسم الكامل</Label>
            <Input
              id="name"
              placeholder="مثال: فارس القحطاني"
              autoComplete="name"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="storeName">اسم المتجر</Label>
            <Input
              id="storeName"
              placeholder="مثال: متجر القحطاني"
              {...register("storeName")}
            />
            {errors.storeName ? (
              <p className="text-xs text-destructive">
                {errors.storeName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              placeholder="store@example.com"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
              <Input
                id="confirmPassword"
                type="password"
                dir="ltr"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            إنشاء الحساب
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:underline"
          >
            تسجيل الدخول
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
