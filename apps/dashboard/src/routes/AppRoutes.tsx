import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ConnectionPage } from "@/pages/ConnectionPage";
import { ProductsListPage } from "@/pages/products/ProductsListPage";
import { ProductCreatePage } from "@/pages/products/ProductCreatePage";
import { ProductEditPage } from "@/pages/products/ProductEditPage";
import { ProductDetailsPage } from "@/pages/products/ProductDetailsPage";
import { OrdersListPage } from "@/pages/orders/OrdersListPage";
import { OrderDetailsPage } from "@/pages/orders/OrderDetailsPage";
import { CustomersListPage } from "@/pages/customers/CustomersListPage";
import { CustomerDetailsPage } from "@/pages/customers/CustomerDetailsPage";
import { NotificationsListPage } from "@/pages/notifications/NotificationsListPage";
import { AutomationsListPage } from "@/pages/automations/AutomationsListPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
  return (
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
          <Route path="/notifications" element={<NotificationsListPage />} />
          <Route path="/connection" element={<ConnectionPage />} />
          <Route
            path="/settings"
            element={<PlaceholderPage title="الإعدادات" phase="المرحلة 12" />}
          />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
