import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FolderTree,
  Users,
  ShieldCheck,
  Workflow,
  Sparkles,
  Bell,
  Plug,
  Settings,
  ScrollText,
  KeyRound,
  BarChart3,
  Send,
  TerminalSquare,
  Ticket,
  Truck,
  Star,
  Store,
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
    label: "تصنيفات المتجر",
    to: "/catalog",
    icon: FolderTree,
    permission: "products.view",
  },
  {
    label: "المخزون الرقمي",
    to: "/digital-inventory",
    icon: KeyRound,
    permission: "digital_inventory.view",
  },
  {
    label: "تسليم الأكواد",
    to: "/digital-delivery",
    icon: Send,
    permission: "digital_delivery.view",
  },
  {
    label: "الموردين",
    to: "/suppliers",
    icon: Truck,
    permission: "digital_suppliers.view",
  },
  {
    label: "تقارير الأكواد",
    to: "/digital-reports",
    icon: BarChart3,
    permission: "digital_reports.view",
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
    label: "الكوبونات",
    to: "/coupons",
    icon: Ticket,
    permission: "coupons.view",
  },
  {
    label: "التقييمات",
    to: "/reviews",
    icon: Star,
    permission: "reviews.view",
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
    label: "أوامر ووردبريس",
    to: "/wp-commands",
    icon: TerminalSquare,
    permission: "wp_commands.view",
  },
  {
    label: "الإعدادات",
    to: "/settings",
    icon: Settings,
    permission: "settings.view",
  },
  {
    label: "إعدادات المتجر",
    to: "/store-settings",
    icon: Store,
    permission: "store_settings.view",
  },
  {
    label: "سجلّ التدقيق",
    to: "/audit-logs",
    icon: ScrollText,
    permission: "settings.view",
  },
];
