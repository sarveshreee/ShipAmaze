import { useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, AlertTriangle, Settings, Plus, Wallet, Calculator, Truck,
  BarChart3, Undo2, Users
} from "lucide-react";

interface TabItem { label: string; icon: any; path: string; }

const adminTabs: TabItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/admin" },
  { label: "Orders", icon: Package, path: "/admin/orders" },
  { label: "NDR", icon: AlertTriangle, path: "/admin/ndr" },
  { label: "Analytics", icon: BarChart3, path: "/admin/analytics" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
];

const vendorTabs: TabItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/vendor" },
  { label: "Orders", icon: Package, path: "/vendor/orders" },
  { label: "Team", icon: Users, path: "/vendor/team" },
  { label: "Settings", icon: Settings, path: "/vendor/settings" },
];

const dropshipperTabs: TabItem[] = [
  { label: "Home", icon: LayoutDashboard, path: "/dropshipper" },
  { label: "Orders", icon: Package, path: "/dropshipper/orders" },
  { label: "Create", icon: Plus, path: "/dropshipper/create-order" },
  { label: "Wallet", icon: Wallet, path: "/dropshipper/wallet" },
  { label: "Settings", icon: Settings, path: "/dropshipper/settings" },
];

const roleTabMap = { admin: adminTabs, vendor: vendorTabs, dropshipper: dropshipperTabs };

export function MobileBottomNav() {
  const { role } = useAuth();
  const location = useLocation();
  const tabs = roleTabMap[role];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {tabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <Link key={tab.path} to={tab.path}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 pt-2.5 text-[10px] font-medium transition-colors relative",
                active ? "text-primary" : "text-text-muted"
              )}>
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
              <tab.icon className={cn("h-5 w-5", active && "scale-110")} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
