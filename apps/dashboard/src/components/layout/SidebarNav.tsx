import { NavLink } from "react-router-dom";
import { navItems } from "@/lib/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  /** Called after a link is clicked — used to close the mobile sheet. */
  onNavigate?: () => void;
};

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const { hasPermission } = useAuth();
  // Hide links the user has no permission for so restricted roles never see
  // dead-end navigation (the destination pages also guard themselves).
  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
    >
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
              isActive &&
                "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )
          }
        >
          <item.icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
