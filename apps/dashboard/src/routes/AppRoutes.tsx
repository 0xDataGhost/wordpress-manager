import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LoadingState } from "@/components/shared/LoadingState";

// Pages are lazy-loaded so each route ships its own chunk. This keeps the
// initial bundle small — a user only downloads the code for the pages they
// actually visit, instead of the whole app (AI, audit logs, automations, …)
// up front. Layouts and the route guard stay eager since every route needs them.
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("@/pages/auth/RegisterPage").then((m) => ({
    default: m.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ConnectionPage = lazy(() =>
  import("@/pages/ConnectionPage").then((m) => ({ default: m.ConnectionPage })),
);
const ProductsListPage = lazy(() =>
  import("@/pages/products/ProductsListPage").then((m) => ({
    default: m.ProductsListPage,
  })),
);
const ProductCreatePage = lazy(() =>
  import("@/pages/products/ProductCreatePage").then((m) => ({
    default: m.ProductCreatePage,
  })),
);
const ProductEditPage = lazy(() =>
  import("@/pages/products/ProductEditPage").then((m) => ({
    default: m.ProductEditPage,
  })),
);
const ProductDetailsPage = lazy(() =>
  import("@/pages/products/ProductDetailsPage").then((m) => ({
    default: m.ProductDetailsPage,
  })),
);
const OrdersListPage = lazy(() =>
  import("@/pages/orders/OrdersListPage").then((m) => ({
    default: m.OrdersListPage,
  })),
);
const OrderDetailsPage = lazy(() =>
  import("@/pages/orders/OrderDetailsPage").then((m) => ({
    default: m.OrderDetailsPage,
  })),
);
const CustomersListPage = lazy(() =>
  import("@/pages/customers/CustomersListPage").then((m) => ({
    default: m.CustomersListPage,
  })),
);
const CustomerDetailsPage = lazy(() =>
  import("@/pages/customers/CustomerDetailsPage").then((m) => ({
    default: m.CustomerDetailsPage,
  })),
);
const NotificationsListPage = lazy(() =>
  import("@/pages/notifications/NotificationsListPage").then((m) => ({
    default: m.NotificationsListPage,
  })),
);
const AutomationsListPage = lazy(() =>
  import("@/pages/automations/AutomationsListPage").then((m) => ({
    default: m.AutomationsListPage,
  })),
);
const AIAssistantsPage = lazy(() =>
  import("@/pages/ai/AIAssistantsPage").then((m) => ({
    default: m.AIAssistantsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const AuditLogsListPage = lazy(() =>
  import("@/pages/audit-logs/AuditLogsListPage").then((m) => ({
    default: m.AuditLogsListPage,
  })),
);
const PlaceholderPage = lazy(() =>
  import("@/pages/PlaceholderPage").then((m) => ({
    default: m.PlaceholderPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingState />
        </div>
      }
    >
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsListPage />} />
            <Route path="/products/new" element={<ProductCreatePage />} />
            <Route path="/products/:id" element={<ProductDetailsPage />} />
            <Route path="/products/:id/edit" element={<ProductEditPage />} />
            <Route path="/orders" element={<OrdersListPage />} />
            <Route path="/orders/:id" element={<OrderDetailsPage />} />
            <Route path="/customers" element={<CustomersListPage />} />
            <Route path="/customers/:id" element={<CustomerDetailsPage />} />
            <Route
              path="/team"
              element={
                <PlaceholderPage title="الموظفين والصلاحيات" phase="المرحلة 3" />
              }
            />
            <Route path="/automations" element={<AutomationsListPage />} />
            <Route path="/ai" element={<AIAssistantsPage />} />
            <Route path="/notifications" element={<NotificationsListPage />} />
            <Route path="/connection" element={<ConnectionPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/audit-logs" element={<AuditLogsListPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
