import { ReactNode, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTabPermissions } from "@/hooks/useTabPermissions";
import { useWalletSummary } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard, Package, AlertTriangle, ShoppingBag, Calculator, Truck, Users, Warehouse, IndianRupee, BarChart3, Headphones, Settings, LogOut, Bell, Menu, X,
  Upload, Link2, Wallet, MapPin, Plus, Scale, Undo2, FileText, Receipt, ClipboardList, Sun, Moon, Shield, ChevronDown, ChevronUp, Home, User, UserCog, ChevronRight,
  PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { roleHomePath } from "@/services/authService";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import * as notificationService from "@/services/notificationService";

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  tabKey?: string;
  shortcut?: string;
  requiresFullAccess?: boolean;
  requiresWarehouseAccess?: boolean;
}
interface NavGroup { title: string; items: (NavItem & { children?: NavItem[] })[]; }

const adminNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/admin/orders" },
    { label: "NDR Management", icon: AlertTriangle, path: "/admin/ndr" },
    { label: "Returns & RTO", icon: Undo2, path: "/admin/returns" },
    { label: "Manifests & Pickups", icon: ClipboardList, path: "/admin/manifests" },
  ]},
  { title: "MANAGEMENT", items: [
    { label: "Rates & Shipping", icon: Calculator, path: "/admin/rates" },
    { label: "Couriers", icon: Truck, path: "/admin/couriers" },
    { label: "Dropshippers", icon: Users, path: "/admin/dropshippers" },
    { label: "Vendors", icon: Warehouse, path: "/admin/vendors" },
    { label: "Users", icon: UserCog, path: "/admin/users" },
    { label: "Catalogue", icon: ShoppingBag, path: "/admin/catalogue" },
    { label: "Approvals", icon: ClipboardList, path: "/admin/approvals" },
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
  { title: "MARKETPLACE", items: [
    { label: "Home", icon: Home, path: "/dropshipper/home", tabKey: "home" },
    { label: "Catalog", icon: ShoppingBag, path: "/dropshipper/catalog", tabKey: "catalog" },
  ]},
  { title: "OVERVIEW", items: [{ label: "Analytics", icon: LayoutDashboard, path: "/dropshipper/dashboard", tabKey: "dashboard" }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/dropshipper/orders", tabKey: "orders", children: [
      { label: "Orders", icon: Package, path: "/dropshipper/orders", tabKey: "orders", shortcut: "G+O" },
      { label: "Add Order", icon: Plus, path: "/dropshipper/add-order", tabKey: "create-order", shortcut: "A+O", requiresFullAccess: true },
    ]},
    { label: "Bulk Upload", icon: Upload, path: "/dropshipper/bulk-upload", tabKey: "bulk-upload", requiresFullAccess: true },
    { label: "Returns", icon: Undo2, path: "/dropshipper/returns", tabKey: "returns" },
    { label: "NDR", icon: AlertTriangle, path: "/dropshipper/ndr", tabKey: "ndr" },
  ]},
  { title: "CONNECT", items: [
    { label: "Channels", icon: Link2, path: "/dropshipper/channels", tabKey: "channels" },
  ]},
  { title: "OPERATIONS", items: [
    { label: "Vendors", icon: Users, path: "/dropshipper/vendors", requiresWarehouseAccess: true },
    { label: "Warehouses", icon: Warehouse, path: "/dropshipper/warehouses", requiresWarehouseAccess: true },
  ]},
  { title: "FINANCE", items: [
    { label: "Wallet", icon: Wallet, path: "/dropshipper/wallet", tabKey: "wallet" },
    { label: "Payouts", icon: IndianRupee, path: "/dropshipper/payouts", tabKey: "payouts" },
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

const SIDEBAR_COLLAPSED_KEY = "shipamaze_sidebar_collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function navItemClasses(active: boolean, collapsed: boolean) {
  return cn(
    "flex w-full items-center rounded-lg text-sm transition-all duration-200 outline-none",
    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 max-lg:min-h-[44px] max-lg:py-3",
    active
      ? "bg-indigo-600 font-medium text-white shadow-sm ring-1 ring-indigo-400/30 dark:bg-indigo-600 dark:ring-indigo-500/40"
      : "text-slate-200 hover:bg-white/10 dark:text-slate-100 dark:hover:bg-white/[0.08]",
  );
}

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
  const { isRestricted, allowWarehouseAccess } = useDropshipperAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [collapsedFlyout, setCollapsedFlyout] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
    setCollapsedFlyout(null);
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    setCollapsedFlyout(null);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);
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
    setExpandedMenus((prev) => {
      const n = new Set(prev);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });
  };

  const rawNav = roleNavMap[role];

  // Filter nav items based on permissions
  const nav = useMemo(() => {
    const allowItem = (item: NavItem & { children?: NavItem[] }) => {
      if (isRestricted && item.requiresFullAccess) return false;
      if (!allowWarehouseAccess && item.requiresWarehouseAccess) return false;
      if (item.tabKey && !isTabEnabled(item.tabKey)) return false;
      if (item.children?.length) {
        const kids = item.children.filter(allowItem);
        return kids.length > 0;
      }
      return true;
    };
    if (role === "admin") return rawNav.filter((group) => group.items.length > 0);
    return rawNav
      .map((group) => ({
        ...group,
        items: group.items
          .filter(allowItem)
          .map((item) =>
            item.children?.length
              ? { ...item, children: item.children.filter(allowItem) }
              : item
          ),
      }))
      .filter((group) => group.items.length > 0);
  }, [rawNav, role, isTabEnabled, isRestricted, allowWarehouseAccess]);

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
    const handler = () => toggleSidebarCollapse();
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, [toggleSidebarCollapse]);

  const homePath = roleHomePath(role);

  const [isLgScreen, setIsLgScreen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgScreen(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setCollapsedFlyout(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen || isLgScreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen, isLgScreen]);

  const isDesktopCollapsed = sidebarCollapsed && isLgScreen;

  const handleSidebarPaddingClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isDesktopCollapsed) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-sidebar-nav-item]") || target.closest("[data-sidebar-toggle]")) return;
    expandSidebar();
  };

  const wrapNavTooltip = (label: string, node: ReactNode) => {
    if (!isDesktopCollapsed) return node;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && !isLgScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <aside
          ref={sidebarRef}
          onClick={handleSidebarPaddingClick}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-xl transition-[width,transform] duration-300 ease-in-out lg:static lg:w-60 lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            isDesktopCollapsed
              ? "lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-r-0 lg:opacity-0 lg:pointer-events-none"
              : "",
          )}
        >
          <div
            className={cn(
              "relative flex shrink-0 items-center border-b border-sidebar-border/80",
              isDesktopCollapsed ? "h-[60px] justify-center px-2" : "h-[60px] gap-2 px-3",
            )}
          >
            <Link
              to={homePath}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex min-w-0 items-center justify-center transition-opacity hover:opacity-90",
                isDesktopCollapsed ? "w-full" : "flex-1",
              )}
              title="ShipAmaze"
            >
              <ShipAmazeLogo placement="sidebar" />
            </Link>

            <button
              type="button"
              data-sidebar-toggle
              className={cn(
                "hidden rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:flex",
                isDesktopCollapsed
                  ? "absolute -right-3 top-1/2 z-10 h-6 w-6 -translate-y-1/2 items-center justify-center border border-sidebar-border bg-sidebar shadow-md"
                  : "shrink-0",
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleSidebarCollapse();
              }}
              aria-label={isDesktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isDesktopCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav
            className={cn(
              "flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3",
              isDesktopCollapsed ? "px-2 space-y-1" : "px-2.5 space-y-0.5",
            )}
          >
            {nav.map((group, gi) => (
              <div
                key={gi}
                className={cn(
                  gi > 0 && (isDesktopCollapsed ? "mt-2 pt-2 border-t border-sidebar-border/50" : "mt-3 pt-3 border-t border-sidebar-border/40"),
                )}
              >
                {group.title && !isDesktopCollapsed ? (
                  <p className="mb-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400/90 dark:text-slate-500">
                    {group.title}
                  </p>
                ) : group.title && isDesktopCollapsed ? (
                  <div className="mx-auto mb-1.5 h-px w-6 bg-sidebar-border/60" aria-hidden />
                ) : null}

                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const hasChildren = !!(item as NavItem & { children?: NavItem[] }).children?.length;
                    const children = (item as NavItem & { children?: NavItem[] }).children;
                    const active = location.pathname === item.path;
                    const isExpanded = expandedMenus.has(item.label);
                    const childActive = children?.some((c) => location.pathname === c.path);

                    if (hasChildren && children) {
                      if (isDesktopCollapsed) {
                        return (
                          <Popover
                            key={item.label}
                            open={collapsedFlyout === item.label}
                            onOpenChange={(open) => setCollapsedFlyout(open ? item.label : null)}
                          >
                            {wrapNavTooltip(
                              item.label,
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  data-sidebar-nav-item
                                  className={navItemClasses(!!childActive, true)}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                                </button>
                              </PopoverTrigger>,
                            )}
                            <PopoverContent
                              side="right"
                              align="start"
                              sideOffset={12}
                              className="w-52 p-1.5"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {item.label}
                              </p>
                              {children.map((child) => {
                                const cActive = location.pathname === child.path;
                                return (
                                  <Link
                                    key={child.path}
                                    to={child.path}
                                    data-sidebar-nav-item
                                    onClick={() => {
                                      setSidebarOpen(false);
                                      setCollapsedFlyout(null);
                                    }}
                                    className={cn(
                                      "flex items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors",
                                      cActive
                                        ? "bg-indigo-600 font-medium text-white"
                                        : "text-foreground hover:bg-muted",
                                    )}
                                  >
                                    <span className="flex items-center gap-2">
                                      <child.icon className="h-4 w-4 opacity-70" />
                                      {child.label}
                                    </span>
                                    {child.shortcut && (
                                      <span className="text-[10px] font-mono text-muted-foreground">{child.shortcut}</span>
                                    )}
                                  </Link>
                                );
                              })}
                            </PopoverContent>
                          </Popover>
                        );
                      }

                      return (
                        <div key={item.label} data-sidebar-nav-item>
                          <button
                            type="button"
                            onClick={() => toggleMenu(item.label)}
                            className={navItemClasses(!!childActive, false)}
                          >
                            <item.icon className="h-[18px] w-[18px] shrink-0" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                            )}
                          </button>
                          <div
                            className={cn(
                              "grid transition-all duration-200 ease-in-out",
                              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                            )}
                          >
                            <div className="overflow-hidden">
                              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-2">
                                {children.map((child) => {
                                  const cActive = location.pathname === child.path;
                                  return (
                                    <Link
                                      key={child.path}
                                      to={child.path}
                                      onClick={() => setSidebarOpen(false)}
                                      className={cn(
                                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors max-lg:min-h-[44px]",
                                        cActive
                                          ? "bg-indigo-600 font-medium text-white shadow-sm dark:bg-indigo-600"
                                          : "text-slate-200 hover:bg-white/10 dark:text-slate-100",
                                      )}
                                    >
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
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const link = (
                      <Link
                        key={item.path}
                        to={item.path}
                        data-sidebar-nav-item
                        onClick={() => setSidebarOpen(false)}
                        className={navItemClasses(active, isDesktopCollapsed)}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!isDesktopCollapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );

                    return <div key={item.path}>{wrapNavTooltip(item.label, link)}</div>;
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn("shrink-0 border-t border-sidebar-border/80 p-2", isDesktopCollapsed && "flex justify-center")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {wrapNavTooltip(
                  userName || "Account",
                  <button
                    type="button"
                    data-sidebar-nav-item
                    className={cn(
                      "flex items-center rounded-lg text-left outline-none ring-indigo-400 transition-colors hover:bg-white/10 focus-visible:ring-2",
                      isDesktopCollapsed ? "justify-center p-2" : "w-full gap-3 px-3 py-2",
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full border-2 border-sidebar-border/80 object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/80 text-sm font-semibold text-white">
                        {avatarLetter}
                      </div>
                    )}
                    {!isDesktopCollapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-50 dark:text-white">{userName || "User"}</p>
                          <p className="truncate text-xs capitalize text-slate-400 dark:text-slate-400">{role}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400" />
                      </>
                    )}
                  </button>,
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isDesktopCollapsed ? "right" : "top"} align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{userName || "User"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(profilePathForRole(role))}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(settingsPathForRole(role))}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogoutClick} className="text-danger focus:text-danger">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </aside>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out">
        <header className="flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-card px-4 sm:h-[60px] sm:gap-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              to={homePath}
              onClick={() => setSidebarOpen(false)}
              className="flex min-w-0 max-w-[min(100%,340px)] shrink items-center transition-opacity hover:opacity-90"
            >
              <ShipAmazeLogo placement="header" />
            </Link>
          </div>

          {isDesktopCollapsed && (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                onClick={expandSidebar}
                aria-label="Open sidebar menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link
                to={homePath}
                className="flex min-w-0 max-w-[min(100%,340px)] shrink items-center transition-opacity hover:opacity-90"
              >
                <ShipAmazeLogo placement="header" />
              </Link>
            </div>
          )}

          {!isDesktopCollapsed && (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                onClick={toggleSidebarCollapse}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
              <h2 className="min-w-0 truncate text-lg font-semibold text-text-primary">{pageTitle}</h2>
            </div>
          )}

          <div className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">

          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-text-secondary sm:h-10 sm:w-10" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <div className="relative">
            <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 text-text-secondary sm:h-10 sm:w-10" onClick={() => setNotifOpen(!notifOpen)}>
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
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card text-sm font-medium text-text-primary hover:bg-surface-2 transition-colors w-9 sm:w-auto sm:px-3 sm:py-1.5"
                aria-label="Wallet balance"
              >
                <IndianRupee className="h-3.5 w-3.5 text-success shrink-0" />
                {walletLoading ? (
                  <span className="hidden h-4 w-16 animate-pulse rounded-md bg-surface-2 sm:inline-block" />
                ) : (
                  <span className="hidden tabular-nums sm:inline">{formatInrTop(displayBalance)}</span>
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
                {!import.meta.env.PROD && (role === "vendor" || role === "dropshipper") && (
                  <Button
                    variant="ghost"
                    className="justify-start h-9 px-2"
                    onClick={() => {
                      setWalletPopoverOpen(false);
                      setAddFundsOpen(true);
                    }}
                  >
                    Add balance (test)
                  </Button>
                )}
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
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-5 lg:px-8 lg:py-6 lg:pb-6">
          {children}
        </main>
      </div>

      <MobileBottomNav />
      <CommandPalette />
      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
    </div>
  );
}
