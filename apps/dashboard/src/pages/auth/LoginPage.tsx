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

const schema = z.object({
  email: z
    .string()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn(values);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "تعذّر تسجيل الدخول. تحقق من اتصالك وحاول مرة أخرى.";
      setError("root", { message });
    }
  });

  return (
    <Card className="shadow-xl shadow-black/5">
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>أدخل بياناتك للوصول إلى لوحة التحكم</CardDescription>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">كلمة المرور</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              dir="ltr"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            تسجيل الدخول
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline"
          >
            أنشئ متجرًا جديدًا
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
