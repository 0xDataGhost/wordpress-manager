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
};

/**
 * Primary navigation. Arabic labels per plan.md Phase 1.
 * Routes other than /dashboard render a placeholder until their phase ships.
 */
export const navItems: NavItem[] = [
  { label: "لوحة التحكم", to: "/dashboard", icon: LayoutDashboard },
  { label: "المنتجات", to: "/products", icon: Package },
  { label: "الطلبات", to: "/orders", icon: ShoppingCart },
  { label: "العملاء", to: "/customers", icon: Users },
  { label: "الموظفين والصلاحيات", to: "/team", icon: ShieldCheck },
  { label: "الأتمتة", to: "/automations", icon: Workflow },
  { label: "المساعد الذكي", to: "/ai", icon: Sparkles },
  { label: "الإشعارات", to: "/notifications", icon: Bell },
  { label: "ربط المتجر", to: "/connection", icon: Plug },
  { label: "الإعدادات", to: "/settings", icon: Settings },
  { label: "سجلّ التدقيق", to: "/audit-logs", icon: ScrollText },
];
