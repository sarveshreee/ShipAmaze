import { useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Package,
  AlertTriangle,
  Settings,
  Plus,
  Wallet,
  Home,
  BarChart3,
  Users,
  Link2,
} from "lucide-react";
import type { UserRole } from "@/services/authService";
import { roleAddOrderPath, roleHomePath } from "@/services/authService";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

interface TabItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

function isNavTabActive(tabPath: string, pathname: string): boolean {
  if (pathname === tabPath) return true;
  if (pathname.startsWith(`${tabPath}/`)) return true;
  if (pathname.startsWith(`${tabPath}?`)) return true;
  return false;
}

function tabsForRole(role: UserRole, staff: ReturnType<typeof useStaffPermissions>): TabItem[] {
  switch (role) {
    case "dropshipper":
      return [
        { label: "Home", icon: Home, path: roleHomePath("dropshipper") },
        { label: "Orders", icon: Package, path: "/dropshipper/orders" },
        { label: "Create", icon: Plus, path: roleAddOrderPath("dropshipper") },
        { label: "Wallet", icon: Wallet, path: "/dropshipper/wallet" },
        { label: "Settings", icon: Settings, path: "/dropshipper/settings" },
      ];
    case "vendor":
      return [
        { label: "Home", icon: Home, path: roleHomePath("vendor") },
        { label: "Orders", icon: Package, path: "/vendor/orders" },
        { label: "Team", icon: Users, path: "/vendor/team" },
        { label: "Settings", icon: Settings, path: "/vendor/settings" },
      ];
    case "admin": {
      const tabs: TabItem[] = [];
      if (staff.isOwnerAdmin || staff.can.ordersView) tabs.push({ label: "Orders", icon: Package, path: "/admin/orders" });
      if (staff.isOwnerAdmin || staff.can.ndrView) tabs.push({ label: "NDR", icon: AlertTriangle, path: "/admin/ndr" });
      if (staff.isOwnerAdmin || staff.can.analyticsView) tabs.push({ label: "Analytics", icon: BarChart3, path: "/admin/analytics" });
      if (staff.isOwnerAdmin || staff.can.channelsView) tabs.push({ label: "Channels", icon: Link2, path: "/admin/channels" });
      tabs.push({ label: "Profile", icon: Home, path: "/admin/profile" });
      return tabs.length > 0 ? tabs : [{ label: "Profile", icon: Home, path: "/admin/profile" }];
    }
  }
}

export function MobileBottomNav() {
  const { role } = useAuth();
  const staff = useStaffPermissions();
  const location = useLocation();
  const tabs = useMemo(() => tabsForRole(role, staff), [role, staff]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm lg:hidden safe-area-bottom"
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const active = isNavTabActive(tab.path, location.pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-text-muted",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
