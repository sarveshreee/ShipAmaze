import { ReactNode, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTabPermissions } from "@/hooks/useTabPermissions";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { notifications } from "@/data/mockData";
import {
  LayoutDashboard, Package, AlertTriangle, ShoppingBag, Calculator, Truck, Users, Warehouse, IndianRupee, BarChart3, Headphones, Settings, LogOut, Bell, Search, Menu, X,
  Upload, Link2, Wallet, MapPin, Plus, Users2, Scale, Undo2, FileText, Receipt, ClipboardList, Sun, Moon, Shield, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface NavItem { label: string; icon: any; path: string; tabKey?: string; shortcut?: string; }
interface NavGroup { title: string; items: (NavItem & { children?: NavItem[] })[]; }

const adminNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/admin" }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/admin/orders" },
    { label: "NDR Management", icon: AlertTriangle, path: "/admin/ndr" },
    { label: "Returns & RTO", icon: Undo2, path: "/admin/returns" },
    { label: "Manifests & Pickups", icon: ClipboardList, path: "/admin/manifests" },
  ]},
  { title: "MANAGEMENT", items: [
    { label: "Catalogue", icon: ShoppingBag, path: "/admin/catalogue" },
    { label: "Rates & Shipping", icon: Calculator, path: "/admin/rates" },
    { label: "Couriers", icon: Truck, path: "/admin/couriers" },
    { label: "Dropshippers", icon: Users, path: "/admin/dropshippers" },
    { label: "Vendors", icon: Warehouse, path: "/admin/vendors" },
    { label: "Pincode Check", icon: MapPin, path: "/admin/pincode" },
    { label: "Tab Permissions", icon: Shield, path: "/admin/permissions" },
  ]},
  { title: "FINANCE", items: [
    { label: "Finance & Wallet", icon: IndianRupee, path: "/admin/finance" },
    { label: "Billing & Invoices", icon: Receipt, path: "/admin/billing" },
    { label: "Weight Disputes", icon: Scale, path: "/admin/weight-disputes" },
  ]},
  { title: "INSIGHTS", items: [
    { label: "Analytics", icon: BarChart3, path: "/admin/analytics" },
    { label: "Reports", icon: FileText, path: "/admin/reports" },
    { label: "Support", icon: Headphones, path: "/admin/support" },
  ]},
  { title: "", items: [{ label: "Settings", icon: Settings, path: "/admin/settings" }] },
];

const vendorNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/vendor", tabKey: "dashboard" }] },
  { title: "ORDERS", items: [{ label: "Orders", icon: Package, path: "/vendor/orders", tabKey: "orders" }] },
  { title: "CATALOGUE", items: [{ label: "Catalogue", icon: ShoppingBag, path: "/vendor/catalogue", tabKey: "catalogue" }] },
  { title: "TEAM", items: [{ label: "Team", icon: Users2, path: "/vendor/team", tabKey: "team" }] },
  { title: "", items: [{ label: "Settings", icon: Settings, path: "/vendor/settings", tabKey: "settings" }] },
];

const dropshipperNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dropshipper", tabKey: "dashboard" }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/dropshipper/orders", tabKey: "orders", children: [
      { label: "Orders", icon: Package, path: "/dropshipper/orders", tabKey: "orders", shortcut: "G+O" },
      { label: "Add Order", icon: Plus, path: "/dropshipper/add-order", tabKey: "create-order", shortcut: "A+O" },
    ]},
    { label: "Bulk Upload", icon: Upload, path: "/dropshipper/bulk-upload", tabKey: "bulk-upload" },
    { label: "Returns", icon: Undo2, path: "/dropshipper/returns", tabKey: "returns" },
    { label: "NDR", icon: AlertTriangle, path: "/dropshipper/ndr", tabKey: "ndr" },
  ]},
  { title: "CONNECT", items: [
    { label: "Channels", icon: Link2, path: "/dropshipper/channels", tabKey: "channels" },
  ]},
  { title: "FINANCE", items: [
    { label: "Wallet", icon: Wallet, path: "/dropshipper/wallet", tabKey: "wallet" },
    { label: "Rate Calculator", icon: Calculator, path: "/dropshipper/rates", tabKey: "rates" },
    { label: "Weight Disputes", icon: Scale, path: "/dropshipper/weight-disputes", tabKey: "weight-disputes" },
  ]},
  { title: "", items: [
    { label: "Pickup Addresses", icon: MapPin, path: "/dropshipper/addresses", tabKey: "addresses" },
    { label: "Track Shipment", icon: Truck, path: "/dropshipper/tracking", tabKey: "tracking" },
    { label: "Settings", icon: Settings, path: "/dropshipper/settings", tabKey: "settings" },
  ]},
];

const roleNavMap = { admin: adminNav, vendor: vendorNav, dropshipper: dropshipperNav };

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, userName, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isTabEnabled } = useTabPermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["Orders"]));

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });
  };

  const rawNav = roleNavMap[role];

  // Filter nav items based on permissions
  const nav = useMemo(() => {
    if (role === "admin") return rawNav;
    return rawNav.map(group => ({
      ...group,
      items: group.items.filter(item => !item.tabKey || isTabEnabled(item.tabKey))
    })).filter(group => group.items.length > 0);
  }, [rawNav, role, isTabEnabled]);

  const unread = notifications.filter(n => !n.read).length;

  const pageTitle = useMemo(() => {
    for (const group of nav) {
      for (const item of group.items) {
        if (location.pathname === item.path) return item.label;
      }
    }
    return "Dashboard";
  }, [location.pathname, nav]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-[60px] items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Package className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-primary-foreground">ShipFlow</span>
          <button className="ml-auto lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {nav.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {group.title}
                </p>
              )}
              {group.items.map(item => {
                const hasChildren = !!(item as any).children?.length;
                const children = (item as any).children as NavItem[] | undefined;
                const active = location.pathname === item.path;
                const isExpanded = expandedMenus.has(item.label);
                const childActive = children?.some(c => location.pathname === c.path);

                if (hasChildren && children) {
                  return (
                    <div key={item.label}>
                      <button onClick={() => toggleMenu(item.label)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          childActive ? "text-sidebar-primary-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent"
                        )}>
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      </button>
                      {isExpanded && (
                        <div className="ml-4 mt-0.5 space-y-0.5">
                          {children.map(child => {
                            const cActive = location.pathname === child.path;
                            return (
                              <Link key={child.path} to={child.path} onClick={() => setSidebarOpen(false)}
                                className={cn(
                                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                                  cActive
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                                )}>
                                <span>{child.label}</span>
                                {child.shortcut && <span className="text-[10px] text-sidebar-foreground/40 font-mono">{child.shortcut}</span>}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}>
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-foreground">
              {userName.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-primary-foreground">{userName || "User"}</p>
              <p className="truncate text-xs text-sidebar-foreground/60 capitalize">{role}</p>
            </div>
            <button onClick={() => { logout(); navigate("/login"); }} className="text-sidebar-foreground/60 hover:text-sidebar-primary-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-[60px] items-center gap-3 border-b border-border bg-card px-4 lg:px-6 shrink-0">
          <button className="lg:hidden text-text-secondary" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-text-primary truncate">{pageTitle}</h2>
          <div className="flex-1" />

          <Button variant="ghost" size="icon" className="text-text-secondary" onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
            document.dispatchEvent(event);
          }}>
            <Search className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="text-text-secondary" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <div className="relative">
            <Button variant="ghost" size="icon" className="text-text-secondary relative" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger" />}
            </Button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-card border border-border shadow-card-lg z-50">
                <div className="p-3 border-b border-border font-semibold text-sm text-text-primary">Notifications</div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map(n => (
                    <div key={n.id} className={cn("px-3 py-2.5 text-sm border-b border-border last:border-0", !n.read && "bg-primary-light/50")}>
                      <p className="text-text-primary">{n.title}</p>
                      <p className="text-xs text-text-muted">{n.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1 rounded-full bg-success-light px-3 py-1 text-sm font-medium text-success-dark">
            <IndianRupee className="h-3 w-3" />12,450
          </div>

          <div className="flex items-center gap-2 ml-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {userName.charAt(0) || "U"}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      <MobileBottomNav />
      <CommandPalette />
    </div>
  );
}
