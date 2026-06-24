import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  ShieldCheck,
  Workflow,
  Sparkles,
  Bell,
  Plug,
  Settings,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  /** Arabic label shown in the sidebar. */
  label: string;
  /** Route path. */
  to: string;
  icon: LucideIcon;
  /**
   * Permission key required to see this link. The link is hidden when the user
   * lacks it — mirroring the permission the backend enforces on that route so
   * restricted roles (Viewer, Marketer, …) don't see dead-end navigation. Items
   * without a permission are visible to every authenticated user.
   */
  permission?: string;
};

/**
 * Primary navigation. Arabic labels per plan.md Phase 1.
 * Each item's `permission` matches the backend guard on the destination route.
 */
export const navItems: NavItem[] = [
  {
    label: "لوحة التحكم",
    to: "/dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
  {
    label: "المنتجات",
    to: "/products",
    icon: Package,
    permission: "products.view",
  },
  {
    label: "الطلبات",
    to: "/orders",
    icon: ShoppingCart,
    permission: "orders.view",
  },
  {
    label: "العملاء",
    to: "/customers",
    icon: Users,
    permission: "customers.view",
  },
  {
    label: "الموظفين والصلاحيات",
    to: "/team",
    icon: ShieldCheck,
    permission: "team.view",
  },
  {
    label: "الأتمتة",
    to: "/automations",
    icon: Workflow,
    permission: "automations.view",
  },
  { label: "المساعد الذكي", to: "/ai", icon: Sparkles, permission: "ai.view" },
  {
    label: "الإشعارات",
    to: "/notifications",
    icon: Bell,
    permission: "dashboard.view",
  },
  {
    label: "ربط المتجر",
    to: "/connection",
    icon: Plug,
    permission: "settings.view",
  },
  {
    label: "الإعدادات",
    to: "/settings",
    icon: Settings,
    permission: "settings.view",
  },
  {
    label: "سجلّ التدقيق",
    to: "/audit-logs",
    icon: ScrollText,
    permission: "settings.view",
  },
];
