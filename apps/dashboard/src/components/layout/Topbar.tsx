import { useNavigate } from "react-router-dom";
import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/components/auth/AuthProvider";

export function Topbar() {
  const navigate = useNavigate();
  const { user, store, signOut } = useAuth();

  const displayName = user?.fullName ?? "حسابي";
  const storeName = store?.name ?? "المتجر";
  const avatarLetter = displayName.trim().charAt(0) || "م";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-6">
      <MobileSidebar />

      <div className="flex flex-1 items-center">
        <span className="text-sm font-medium text-muted-foreground lg:hidden">
          لوحة المتجر
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2"
              aria-label="حساب المستخدم"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {avatarLetter}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-start sm:block">
                <p className="text-sm font-medium leading-none">
                  {displayName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {storeName}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>حسابي</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <UserIcon className="h-4 w-4" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
