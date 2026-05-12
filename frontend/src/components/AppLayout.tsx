import { ReactNode, useMemo, useEffect, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTabPermissions } from "@/hooks/useTabPermissions";
import { useWalletSummary } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard, Package, AlertTriangle, ShoppingBag, Calculator, Truck, Users, Warehouse, IndianRupee, BarChart3, Headphones, Settings, LogOut, Bell, Menu, X, Layers,
  Upload, Link2, Wallet, MapPin, Plus, Scale, Undo2, FileText, Receipt, ClipboardList, Sun, Moon, Shield, ChevronDown, ChevronUp, Home, User, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddFundsModal } from "@/components/AddFundsModal";
import type { UserRole } from "@/services/authService";
import * as notificationService from "@/services/notificationService";

interface NavItem { label: string; icon: any; path: string; tabKey?: string; shortcut?: string; }
interface NavGroup { title: string; items: (NavItem & { children?: NavItem[] })[]; }

const adminNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/admin/orders" },
    { label: "NDR Management", icon: AlertTriangle, path: "/admin/ndr" },
    { label: "Returns & RTO", icon: Undo2, path: "/admin/returns" },
    { label: "Manifests & Pickups", icon: ClipboardList, path: "/admin/manifests" },
  ]},
  { title: "SUPPLIER", items: [
    { label: "Catalogue", icon: Layers, path: "/admin/catalogue" },
    { label: "Add a Product", icon: Plus, path: "/admin/source-product" },
    { label: "Products", icon: ShoppingBag, path: "/admin/products" },
    { label: "Bulk Upload Products", icon: Upload, path: "/admin/bulk-upload-products" },
    { label: "New Product Request", icon: ClipboardList, path: "/admin/product-requests" },
  ]},
  { title: "MANAGEMENT", items: [
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
  { title: "", items: [
    { label: "Profile", icon: User, path: "/admin/profile" },
    { label: "Change Password", icon: Shield, path: "/admin/change-password" },
    { label: "Settings", icon: Settings, path: "/admin/settings" },
  ]},
];

const vendorNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/vendor/dashboard", tabKey: "dashboard" }] },
  { title: "SUPPLIER", items: [
    { label: "Add a Product", icon: Plus, path: "/vendor/source-product", tabKey: "source-product" },
    { label: "Products", icon: ShoppingBag, path: "/vendor/products", tabKey: "products" },
    { label: "Bulk Upload Products", icon: Upload, path: "/vendor/bulk-upload-products", tabKey: "bulk-upload-products" },
    { label: "New Product Request", icon: ClipboardList, path: "/vendor/product-requests", tabKey: "product-requests" },
  ]},
  { title: "ORDERS", items: [{ label: "Orders", icon: Package, path: "/vendor/orders", tabKey: "orders" }] },
  { title: "LOGISTICS", items: [{ label: "Warehouse", icon: Warehouse, path: "/vendor/warehouse", tabKey: "warehouse" }] },
  { title: "FINANCE", items: [
    { label: "Wallet", icon: Wallet, path: "/vendor/wallet", tabKey: "wallet" },
    { label: "Payouts", icon: IndianRupee, path: "/vendor/payouts", tabKey: "payouts" },
  ]},
  
  { title: "", items: [
    { label: "Profile", icon: User, path: "/vendor/profile" },
    { label: "Change Password", icon: Shield, path: "/vendor/change-password", tabKey: "change-password" },
  ]},
];

const dropshipperNav: NavGroup[] = [
  { title: "MARKETPLACE", items: [{ label: "Home", icon: Home, path: "/dropshipper/home", tabKey: "home" }] },
  { title: "OVERVIEW", items: [{ label: "Analytics", icon: LayoutDashboard, path: "/dropshipper/dashboard", tabKey: "dashboard" }] },
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
    { label: "Pickup Addresses", icon: MapPin, path: "/dropshipper/pickup-addresses", tabKey: "addresses" },
  ]},
  { title: "", items: [
    { label: "Profile", icon: User, path: "/dropshipper/profile" },
    { label: "Track Shipment", icon: Truck, path: "/dropshipper/tracking", tabKey: "tracking" },
    { label: "Settings", icon: Settings, path: "/dropshipper/settings", tabKey: "settings" },
  ]},
];

const roleNavMap = { admin: adminNav, vendor: vendorNav, dropshipper: dropshipperNav };

function settingsPathForRole(role: UserRole) {
  if (role === "admin") return "/admin/settings";
  if (role === "vendor") return "/vendor/settings";
  return "/dropshipper/settings";
}

function profilePathForRole(role: UserRole) {
  return `/${role}/profile`;
}

function walletPagePath(role: UserRole) {
  if (role === "vendor") return "/vendor/wallet";
  if (role === "dropshipper") return "/dropshipper/wallet";
  return "/admin/finance";
}

function formatInrTop(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, userName, logout, user } = useAuth();
  const { data: walletSummary, isLoading: walletLoading } = useWalletSummary();
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [walletPopoverOpen, setWalletPopoverOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { isTabEnabled } = useTabPermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebarCollapse = () => setSidebarCollapsed(prev => !prev);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<notificationService.NotificationItem[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["Orders"]));

  const fetchNotifications = useCallback(
    async (opts?: { page?: number; append?: boolean }) => {
      const page = opts?.page ?? 1;
      const append = opts?.append ?? false;
      setNotifLoading(true);
      try {
        const r = await notificationService.listNotifications(page, 20);
        setNotifUnread(r.unreadCount ?? 0);
        setNotifTotal(r.total ?? 0);
        if (append) {
          setNotifications((prev) => [...prev, ...(r.items ?? [])]);
        } else {
          setNotifications(r.items ?? []);
        }
      } catch {
        if (!append) {
          setNotifications([]);
          setNotifUnread(0);
          setNotifTotal(0);
        }
      } finally {
        setNotifLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!user) return;
    void fetchNotifications({ page: 1, append: false });
  }, [user, fetchNotifications]);

  useEffect(() => {
    const handler = () => void fetchNotifications({ page: 1, append: false });
    window.addEventListener("shipamaze:refetch:notifications", handler);
    return () => window.removeEventListener("shipamaze:refetch:notifications", handler);
  }, [fetchNotifications]);

  useEffect(() => {
    if (notifOpen && user) void fetchNotifications({ page: 1, append: false });
  }, [notifOpen, user, fetchNotifications]);

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

  const unread = notifUnread;

  const pageTitle = useMemo(() => {
    for (const group of nav) {
      for (const item of group.items) {
        if (location.pathname === item.path) return item.label;
        const children = (item as NavItem & { children?: NavItem[] }).children;
        const child = children?.find((c) => location.pathname === c.path);
        if (child) return child.label;
      }
    }
    return "Dashboard";
  }, [location.pathname, nav]);

  const displayBalance = walletSummary?.balance ?? 0;
  const pendingCod = walletSummary?.pendingCod ?? 0;
  const avatarLetter = (user?.name ?? userName ?? "U").trim().charAt(0).toUpperCase();
  const avatarSrc = user?.avatarUrl?.trim() ? user.avatarUrl.trim() : null;

  const onLogoutClick = () => {
    logout();
  };

  // Listen for sidebar toggle events from child components
  useEffect(() => {
    const handler = () => setSidebarCollapsed(prev => !prev);
    window.addEventListener('toggle-sidebar', handler);
    return () => window.removeEventListener('toggle-sidebar', handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-sidebar transition-all duration-200 lg:static lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        sidebarCollapsed && "lg:w-0 lg:overflow-hidden lg:opacity-0"
      )}>
        <div className="flex h-[60px] items-center gap-2 px-5 border-b border-sidebar-border">
          <Link
            to={role === "dropshipper" ? "/dropshipper/home" : role === "admin" ? "/admin/dashboard" : "/vendor/dashboard"}
            className="flex items-center gap-2 min-w-0 flex-1"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 dark:bg-indigo-600">
              <Package className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold truncate text-slate-100 dark:text-white">ShipAmaze</span>
          </Link>
          <button
            type="button"
            className="lg:hidden rounded-md p-1 text-slate-200 hover:bg-white/10 dark:text-slate-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-hide py-3 px-2 space-y-0.5">
          {nav.map((group, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-2 pt-2 border-t border-sidebar-border/40")}>
              {group.title ? (
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              ) : null}

              {group.items.map(item => {
                const hasChildren = !!(item as any).children?.length;
                const children = (item as any).children as NavItem[] | undefined;
                const active = location.pathname === item.path;
                const isExpanded = expandedMenus.has(item.label);
                const childActive = children?.some(c => location.pathname === c.path);

                if (hasChildren && children) {
                  return (
                    <div key={item.label}>
                      <button
                        type="button"
                        onClick={() => toggleMenu(item.label)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          childActive
                            ? "font-medium text-white dark:text-slate-50"
                            : "text-slate-200 hover:bg-white/10 dark:text-slate-100"
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-400" />
                        )}
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
                                    ? "bg-indigo-600 font-medium text-white shadow-sm dark:bg-indigo-600"
                                    : "text-slate-200 hover:bg-white/10 dark:text-slate-100"
                                )}>
                                <span>{child.label}</span>
                                {child.shortcut && (
                                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                    {child.shortcut}
                                  </span>
                                )}
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
                        ? "bg-indigo-600 font-medium text-white shadow-sm dark:bg-indigo-600"
                        : "text-slate-200 hover:bg-white/10 dark:text-slate-100"
                    )}>
                    <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none ring-indigo-400 focus-visible:ring-2 hover:bg-white/10 transition-colors"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-sidebar-border" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-slate-100 dark:text-slate-100">
                    {avatarLetter}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100 dark:text-white">{userName || "User"}</p>
                  <p className="truncate text-xs capitalize text-slate-400 dark:text-slate-400">{role}</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400 dark:text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{userName || "User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(profilePathForRole(role))}>
                <User className="h-4 w-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(settingsPathForRole(role))}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogoutClick} className="text-danger focus:text-danger">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-[60px] items-center gap-3 border-b border-border bg-card px-4 lg:px-6 shrink-0">
          <button className="lg:hidden text-text-secondary" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-text-primary truncate">{pageTitle}</h2>
          <div className="flex-1 min-w-0" />

          <Button variant="ghost" size="icon" className="text-text-secondary" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <div className="relative">
            <Button variant="ghost" size="icon" className="text-text-secondary relative" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-[10px] font-bold text-white flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-card border border-border shadow-card-lg z-50">
                <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-text-primary">Notifications</span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={async () => {
                        try {
                          await notificationService.markAllNotificationsRead();
                          await fetchNotifications({ page: 1, append: false });
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Read all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-danger"
                      onClick={async () => {
                        try {
                          await notificationService.clearAllNotifications();
                          await fetchNotifications({ page: 1, append: false });
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifLoading && notifications.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-text-muted">Loading…</div>
                  ) : notifications.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-text-muted">No notifications yet</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        className={cn(
                          "w-full text-left px-3 py-2.5 text-sm border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors",
                          !n.read && "bg-primary-light/50"
                        )}
                        onClick={async () => {
                          if (!n.read) {
                            try {
                              await notificationService.markNotificationRead(n.id);
                            } catch {
                              /* ignore */
                            }
                          }
                          await fetchNotifications({ page: 1, append: false });
                        }}
                      >
                        <p className="text-text-primary font-medium">{n.title}</p>
                        {n.body ? <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.body}</p> : null}
                        <p className="text-[10px] text-text-muted mt-1">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
                {notifications.length < notifTotal && (
                  <div className="p-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={notifLoading}
                      onClick={() => {
                        const next = Math.floor(notifications.length / 20) + 1;
                        void fetchNotifications({ page: next, append: true });
                      }}
                    >
                      {notifLoading ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Popover open={walletPopoverOpen} onOpenChange={setWalletPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-2 transition-colors shrink-0"
              >
                <IndianRupee className="h-3.5 w-3.5 text-success shrink-0" />
                {walletLoading ? (
                  <span className="h-4 w-20 animate-pulse rounded-md bg-surface-2" />
                ) : (
                  <span className="tabular-nums">{formatInrTop(displayBalance)}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b border-border p-4 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Available balance</p>
                <p className="text-xl font-semibold tabular-nums text-text-primary">{formatInrTop(displayBalance)}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted pt-3">Pending COD</p>
                <p className="text-sm font-medium tabular-nums text-text-primary">{formatInrTop(pendingCod)}</p>
              </div>
              <div className="flex flex-col gap-0.5 p-2">
                <Button
                  variant="ghost"
                  className="justify-start h-9 px-2"
                  onClick={() => {
                    setWalletPopoverOpen(false);
                    setAddFundsOpen(true);
                  }}
                >
                  Add balance
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-9 px-2"
                  onClick={() => {
                    setWalletPopoverOpen(false);
                    navigate(walletPagePath(role));
                  }}
                >
                  View wallet
                  <ChevronRight className="h-4 w-4 ml-auto opacity-60" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card hover:bg-surface-2 transition-colors outline-none ring-primary focus-visible:ring-2"
                aria-label="Account menu"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-primary">{avatarLetter}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{userName || "User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(profilePathForRole(role))}>
                <User className="h-4 w-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(settingsPathForRole(role))}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogoutClick} className="text-danger focus:text-danger">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      <MobileBottomNav />
      <CommandPalette />
      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
    </div>
  );
}
