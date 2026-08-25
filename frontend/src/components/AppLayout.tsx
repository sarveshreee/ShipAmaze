import { ReactNode, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTabPermissions } from "@/hooks/useTabPermissions";
import { useStaffPermissions, type StaffPermission } from "@/hooks/useStaffPermissions";
import { useWalletSummary, prefetchOrdersWorkspace } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard, Package, AlertTriangle, ShoppingBag, Calculator, Truck, Users, Warehouse, IndianRupee, BarChart3, Headphones, Settings, LogOut, Bell, Menu, X,
  Upload, Link2, Wallet, MapPin, Plus, Scale, Undo2, FileText, Receipt, ClipboardList, Sun, Moon, Shield, ChevronDown, ChevronUp, Home, User, UserCog, ChevronRight, Activity, KeyRound, PanelLeft,
  type LucideIcon,
} from "lucide-react";
import { ShipAmazeLogo, SidebarBrand } from "@/components/brand/ShipAmazeLogo";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
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
import type { UserRole } from "@/services/authService";
import { roleHomePath } from "@/services/authService";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import * as notificationService from "@/services/notificationService";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";

const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);
const AddFundsModal = lazy(() =>
  import("@/components/AddFundsModal").then((m) => ({ default: m.AddFundsModal }))
);

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  tabKey?: string;
  shortcut?: string;
  requiresFullAccess?: boolean;
  requiresWarehouseAccess?: boolean;
  staffPermission?: StaffPermission | StaffPermission[];
  ownerOnly?: boolean;
}
interface NavGroup { title: string; items: (NavItem & { children?: NavItem[] })[]; }

const adminNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard", staffPermission: ["orders.view", "analytics.view", "products.view"] }] },
  { title: "ORDERS", items: [
    { label: "Orders", icon: Package, path: "/admin/orders", staffPermission: "orders.view", children: [
      { label: "Orders", icon: Package, path: "/admin/orders", staffPermission: "orders.view" },
      { label: "Add Order", icon: Plus, path: "/admin/add-order", staffPermission: "orders.create" },
    ]},
    { label: "NDR Management", icon: AlertTriangle, path: "/admin/ndr", staffPermission: "ndr.view" },
    { label: "Returns & RTO", icon: Undo2, path: "/admin/returns", staffPermission: "returns.view" },
    { label: "Manifests & Pickups", icon: ClipboardList, path: "/admin/manifests", ownerOnly: true },
  ]},
  { title: "PRODUCTS", items: [
    { label: "Add Product", icon: Plus, path: "/admin/source-product", staffPermission: "products.create" },
    { label: "Products", icon: ShoppingBag, path: "/admin/products", staffPermission: "products.view" },
    { label: "Bulk Upload", icon: Upload, path: "/admin/bulk-upload-products", staffPermission: "products.import" },
    { label: "Catalogue", icon: ShoppingBag, path: "/admin/catalogue", staffPermission: "products.view" },
    { label: "New Product Request", icon: ClipboardList, path: "/admin/product-requests", staffPermission: "products.view" },
    { label: "Create Category", icon: Plus, path: "/admin/categories", ownerOnly: true },
    { label: "Marketplace", icon: Home, path: "/admin/home", staffPermission: "products.view" },
  ]},
  { title: "CONNECT", items: [
    { label: "Channels", icon: Link2, path: "/admin/channels", staffPermission: "channels.view" },
  ]},
  { title: "MANAGEMENT", items: [
    { label: "Rates & Shipping", icon: Calculator, path: "/admin/rates", ownerOnly: true },
    { label: "Couriers", icon: Truck, path: "/admin/couriers", ownerOnly: true },
    { label: "Dropshippers", icon: Users, path: "/admin/dropshippers", ownerOnly: true },
    { label: "Vendors", icon: Warehouse, path: "/admin/vendors", ownerOnly: true },
    { label: "Users", icon: UserCog, path: "/admin/users", ownerOnly: true },
    { label: "Partner API", icon: KeyRound, path: "/admin/partners", ownerOnly: true },
    { label: "Approvals", icon: ClipboardList, path: "/admin/approvals", ownerOnly: true },
    { label: "KYC Approvals", icon: Shield, path: "/admin/kyc", ownerOnly: true },
    { label: "Pickup Addresses", icon: MapPin, path: "/admin/pickup-addresses", ownerOnly: true },
    { label: "Pincode Check", icon: MapPin, path: "/admin/pincode", ownerOnly: true },
    { label: "Permission Management", icon: Shield, path: "/admin/permissions", ownerOnly: true },
  ]},
  { title: "FINANCE", items: [
    { label: "Finance & Wallet", icon: IndianRupee, path: "/admin/finance", ownerOnly: true },
    { label: "Billing & Invoices", icon: Receipt, path: "/admin/billing", ownerOnly: true },
    { label: "Weight Disputes", icon: Scale, path: "/admin/weight-disputes", ownerOnly: true },
  ]},
  { title: "INSIGHTS", items: [
    { label: "Analytics", icon: BarChart3, path: "/admin/analytics", staffPermission: "analytics.view" },
    { label: "Reports", icon: FileText, path: "/admin/reports", ownerOnly: true },
    { label: "Support", icon: Headphones, path: "/admin/support", ownerOnly: true },
    { label: "Activity Logs", icon: Activity, path: "/admin/activity-logs", ownerOnly: true },
  ]},
  { title: "SECURITY", items: [
    { label: "Login Activity", icon: Shield, path: "/admin/security/login-activity", ownerOnly: true },
  ]},
];

const vendorNav: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/vendor/dashboard", tabKey: "dashboard" }] },
  { title: "SUPPLIER", items: [
    { label: "Add a Product", icon: Plus, path: "/vendor/source-product", tabKey: "source-product" },
    { label: "Products", icon: ShoppingBag, path: "/vendor/products", tabKey: "products" },
    { label: "Bulk Upload Products", icon: Upload, path: "/vendor/bulk-upload-products", tabKey: "bulk-upload-products" },
    { label: "Requested Product", icon: ClipboardList, path: "/vendor/requested-products", tabKey: "product-requests" },
  ]},
  { title: "ORDERS", items: [{ label: "Orders", icon: Package, path: "/vendor/orders", tabKey: "orders" }] },
  { title: "LOGISTICS", items: [
    { label: "Pickup Addresses", icon: MapPin, path: "/vendor/pickup-addresses", tabKey: "addresses" },
  ]},
  { title: "FINANCE", items: [
    { label: "Wallet", icon: Wallet, path: "/vendor/wallet", tabKey: "wallet" },
    { label: "Payouts", icon: IndianRupee, path: "/vendor/payouts", tabKey: "payouts" },
  ]},
  { title: "ACCOUNT", items: [
    { label: "Profile", icon: User, path: "/vendor/profile" },
    { label: "Settings", icon: Settings, path: "/vendor/settings", tabKey: "settings" },
    { label: "Change Password", icon: Shield, path: "/vendor/change-password" },
    { label: "Support", icon: Headphones, path: "/vendor/support", tabKey: "support" },
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
  ]},
  { title: "FINANCE", items: [
    { label: "Wallet", icon: Wallet, path: "/dropshipper/wallet", tabKey: "wallet" },
    { label: "Payouts", icon: IndianRupee, path: "/dropshipper/payouts", tabKey: "payouts" },
    { label: "Rate Calculator", icon: Calculator, path: "/dropshipper/rates", tabKey: "rates" },
    { label: "Weight Disputes", icon: Scale, path: "/dropshipper/weight-disputes", tabKey: "weight-disputes" },
    { label: "Pickup Addresses", icon: MapPin, path: "/dropshipper/pickup-addresses", tabKey: "addresses" },
  ]},
  { title: "ACCOUNT", items: [
    { label: "Profile", icon: User, path: "/dropshipper/profile" },
    { label: "Change Password", icon: Shield, path: "/dropshipper/change-password" },
    { label: "Support", icon: Headphones, path: "/dropshipper/support", tabKey: "support" },
    { label: "Track Shipment", icon: Truck, path: "/dropshipper/tracking", tabKey: "tracking" },
    { label: "Settings", icon: Settings, path: "/dropshipper/settings", tabKey: "settings" },
  ]},
];

const roleNavMap = { admin: adminNav, vendor: vendorNav, dropshipper: dropshipperNav };

const SIDEBAR_RAIL_WIDTH = "4.5rem";

function navItemClasses(active: boolean, collapsed: boolean) {
  return cn(
    "group flex w-full items-center rounded-xl text-sm transition-all duration-200 outline-none",
    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 max-lg:min-h-[44px] max-lg:py-3",
    active
      ? "bg-primary font-medium text-white shadow-md shadow-primary/25 ring-1 ring-primary/30"
      : "text-slate-200 hover:bg-white/10 dark:text-slate-100 dark:hover:bg-white/[0.08]",
  );
}

function SidebarNavIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
        active
          ? "bg-white/20 text-white"
          : "bg-white/[0.07] text-primary group-hover:bg-white/12 group-hover:text-primary",
      )}
    >
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} />
    </span>
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

function changePasswordPathForRole(role: UserRole) {
  return `/${role}/change-password`;
}

function AccountMenuPanel({
  role,
  userName,
  email,
  isOwnerAdmin,
  onNavigate,
  onLogout,
}: {
  role: UserRole;
  userName: string;
  email: string;
  isOwnerAdmin: boolean;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  return (
    <div className="w-56 py-1">
      <div className="px-2 py-1.5">
        <p className="truncate text-sm font-medium">{userName || "User"}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={() => onNavigate(profilePathForRole(role))}
      >
        <User className="mr-2 h-4 w-4" />
        Profile
      </button>
      <button
        type="button"
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={() => onNavigate(changePasswordPathForRole(role))}
      >
        <Shield className="mr-2 h-4 w-4" />
        Change Password
      </button>
      {(role !== "admin" || isOwnerAdmin) && (
        <button
          type="button"
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => onNavigate(settingsPathForRole(role))}
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </button>
      )}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-danger outline-none transition-colors hover:bg-accent focus:text-danger"
        onClick={onLogout}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Logout
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, userName, logout, user, userId } = useAuth();
  const qc = useQueryClient();
  const { data: walletSummary, isLoading: walletLoading } = useWalletSummary();
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [walletPopoverOpen, setWalletPopoverOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { isTabEnabled } = useTabPermissions();
  const { isOwnerAdmin, hasAny } = useStaffPermissions();
  const { isRestricted, allowWarehouseAccess, allowOwnPickupProcessing, isKycPending, kycStatus } = useDropshipperAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [collapsedFlyout, setCollapsedFlyout] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarHoverOpenTimer = useRef<number>();
  const sidebarHoverCloseTimer = useRef<number>();
  const [sidebarAccountOpen, setSidebarAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<notificationService.NotificationItem[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["Orders"]));
  // Avoid duplicate fetch when opening bell right after mount (list already loaded)
  const notifLoadedOnce = useRef(false);

  const fetchNotifications = useCallback(
    async (opts?: { page?: number; append?: boolean; force?: boolean }) => {
      const page = opts?.page ?? 1;
      const append = opts?.append ?? false;
      setNotifLoading(true);
      try {
        if (opts?.force) {
          await qc.invalidateQueries({ queryKey: queryKeys.notifications(userId, page) });
        }
        const r = await qc.fetchQuery({
          queryKey: queryKeys.notifications(userId, page),
          queryFn: () => notificationService.listNotifications(page, 20),
          staleTime: 60 * 1000,
        });
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
    [qc, userId]
  );

  // Prefetch unread count only; full list when the bell opens
  useEffect(() => {
    setNotifications([]);
    setNotifUnread(0);
    setNotifTotal(0);
    notifLoadedOnce.current = false;
    if (!user) return;
    void (async () => {
      try {
        const r = await notificationService.listNotifications(1, 1, { summary: true });
        setNotifUnread(r.unreadCount ?? 0);
        setNotifTotal(r.total ?? 0);
      } catch {
        setNotifUnread(0);
      }
    })();
  }, [user, userId]);

  useEffect(() => {
    if (!userId) return;
    prefetchOrdersWorkspace(userId);
  }, [userId]);

  useEffect(() => {
    const handler = () => void fetchNotifications({ page: 1, append: false, force: true });
    window.addEventListener("shipamaze:refetch:notifications", handler);
    return () => window.removeEventListener("shipamaze:refetch:notifications", handler);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!notifOpen || !user || notifLoadedOnce.current) return;
    notifLoadedOnce.current = true;
    void fetchNotifications({ page: 1, append: false });
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
      // RESTRICTED hides full-access items unless admin unlocked own-pickup processing
      // (Add Order / Bulk Upload needed to create orders they can then process).
      if (isRestricted && item.requiresFullAccess && !allowOwnPickupProcessing) return false;
      if (!allowWarehouseAccess && item.requiresWarehouseAccess) return false;
      if (item.tabKey && !isTabEnabled(item.tabKey)) return false;
      if (role === "admin" && !isOwnerAdmin) {
        if (item.ownerOnly) return false;
        if (item.staffPermission) {
          const perms = Array.isArray(item.staffPermission) ? item.staffPermission : [item.staffPermission];
          if (!hasAny(perms)) return false;
        }
      }
      if (item.children?.length) {
        const kids = item.children.filter(allowItem);
        return kids.length > 0;
      }
      return true;
    };
    if (role === "admin") {
      return rawNav
        .map((group) => ({
          ...group,
          items: group.items.filter(allowItem),
        }))
        .filter((group) => group.items.length > 0);
    }
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
  }, [rawNav, role, isTabEnabled, isRestricted, allowOwnPickupProcessing, allowWarehouseAccess, isOwnerAdmin, hasAny]);

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
    setSidebarAccountOpen(false);
    logout();
  };

  const navigateFromAccountMenu = (path: string) => {
    setSidebarAccountOpen(false);
    navigate(path);
  };

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
    setSidebarAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen || isLgScreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen, isLgScreen]);

  const isDesktopCollapsed = isLgScreen && !sidebarHovered && !sidebarPinned;

  useEffect(() => {
    const width = !isLgScreen ? "0px" : SIDEBAR_RAIL_WIDTH;
    document.documentElement.style.setProperty("--sidebar-width", width);
  }, [isLgScreen]);

  useEffect(() => {
    return () => {
      window.clearTimeout(sidebarHoverOpenTimer.current);
      window.clearTimeout(sidebarHoverCloseTimer.current);
    };
  }, []);

  const onSidebarEnter = () => {
    if (!isLgScreen || sidebarPinned) return;
    window.clearTimeout(sidebarHoverCloseTimer.current);
    sidebarHoverOpenTimer.current = window.setTimeout(() => setSidebarHovered(true), 90);
  };

  const onSidebarLeave = () => {
    if (!isLgScreen || sidebarPinned) return;
    window.clearTimeout(sidebarHoverOpenTimer.current);
    sidebarHoverCloseTimer.current = window.setTimeout(() => {
      setSidebarHovered(false);
      setCollapsedFlyout(null);
      setSidebarAccountOpen(false);
    }, 160);
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

      <TooltipProvider delayDuration={400} skipDelayDuration={200}>
        <aside
          ref={sidebarRef}
          onMouseEnter={onSidebarEnter}
          onMouseLeave={onSidebarLeave}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col border-r border-sidebar-border bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 shadow-xl transition-[width,transform] duration-150 ease-out will-change-[width,transform]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            isLgScreen && (sidebarHovered || sidebarPinned ? "lg:w-60" : "lg:w-[4.5rem]"),
          )}
        >
          <div
            className={cn(
              "relative flex shrink-0 items-center gap-2 border-b border-sidebar-border/80 bg-sidebar",
              isDesktopCollapsed ? "min-h-[3.25rem] justify-center px-1 py-2" : "min-h-[4.5rem] px-4 py-3",
            )}
          >
            <Link
              to={homePath}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex min-w-0 flex-1 items-center transition-opacity hover:opacity-90",
                isDesktopCollapsed ? "justify-center" : "",
              )}
              title="ShipAmaze"
            >
              <SidebarBrand showText={!isDesktopCollapsed} compact={isDesktopCollapsed} />
            </Link>

            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white lg:inline-flex"
              onClick={() => {
                setSidebarPinned((p) => {
                  const next = !p;
                  if (next) setSidebarHovered(true);
                  else setSidebarHovered(false);
                  return next;
                });
              }}
              aria-label={sidebarPinned ? "Collapse sidebar" : "Pin sidebar open"}
              title={sidebarPinned ? "Collapse sidebar" : "Pin sidebar open"}
            >
              <PanelLeft className={cn("h-4 w-4", sidebarPinned && "text-primary")} />
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
              "flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-3",
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
                  <p className="mb-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/70">
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
                                  <SidebarNavIcon icon={item.icon} active={!!childActive} />
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
                                        ? "bg-primary font-medium text-white"
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
                            <SidebarNavIcon icon={item.icon} active={!!childActive} />
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
                                          ? "bg-primary font-medium text-white shadow-sm"
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
                        <SidebarNavIcon icon={item.icon} active={active} />
                        {!isDesktopCollapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );

                    return <div key={item.path}>{wrapNavTooltip(item.label, link)}</div>;
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn("relative shrink-0 border-t border-sidebar-border/80 p-2", isDesktopCollapsed && "flex justify-center")}>
            <Popover open={sidebarAccountOpen} onOpenChange={setSidebarAccountOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-sidebar-nav-item
                  className={cn(
                    "flex items-center rounded-lg text-left outline-none ring-primary/40 transition-colors hover:bg-white/10 focus-visible:ring-2",
                    isDesktopCollapsed ? "justify-center p-2" : "w-full gap-3 px-3 py-2",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className={cn(
                        "shrink-0 rounded-full border-2 border-sidebar-border/80 object-cover",
                        isDesktopCollapsed ? "h-8 w-8" : "h-9 w-9",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-full bg-primary/90 font-semibold text-white shadow-sm",
                        isDesktopCollapsed ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm",
                      )}
                    >
                      {avatarLetter}
                    </div>
                  )}
                  {!isDesktopCollapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-50 dark:text-white">{userName || "User"}</p>
                      <p className="truncate text-xs capitalize text-slate-400 dark:text-slate-400">{role}</p>
                    </div>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="end"
                sideOffset={12}
                collisionPadding={16}
                className="w-56 border border-border/80 bg-popover p-0 shadow-xl"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <AccountMenuPanel
                  role={role}
                  userName={userName || "User"}
                  email={user?.email ?? ""}
                  isOwnerAdmin={isOwnerAdmin}
                  onNavigate={navigateFromAccountMenu}
                  onLogout={onLogoutClick}
                />
              </PopoverContent>
            </Popover>
          </div>
      </aside>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[4.5rem]">
        <ImpersonationBanner />
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
              className="flex min-w-0 max-w-[min(100%,420px)] shrink items-center transition-opacity hover:opacity-90"
            >
              <ShipAmazeLogo placement="header" />
            </Link>
          </div>

          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <h2 className="min-w-0 truncate text-lg font-semibold text-text-primary">{pageTitle}</h2>
          </div>

          <div className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">

          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-text-secondary sm:h-10 sm:w-10" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 shrink-0 text-text-secondary sm:h-10 sm:w-10"
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-[10px] font-bold text-white flex items-center justify-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
              <div className="rounded-lg bg-card border-0 shadow-none">
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
                          await fetchNotifications({ page: 1, append: false, force: true });
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
                          await fetchNotifications({ page: 1, append: false, force: true });
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
                          await fetchNotifications({ page: 1, append: false, force: true });
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
            </PopoverContent>
          </Popover>

          {!(role === "admin" && !isOwnerAdmin) && (
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
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted pt-3">Pending remittance</p>
                <p className="text-sm font-medium tabular-nums text-text-primary">{formatInrTop(pendingCod)}</p>
                <p className="text-[10px] text-text-muted">Settlement backlog — not undelivered COD</p>
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
          )}

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
              <DropdownMenuItem onSelect={() => navigate(changePasswordPathForRole(role))}>
                <Shield className="h-4 w-4 mr-2" />
                Change Password
              </DropdownMenuItem>
              {(role !== "admin" || isOwnerAdmin) && (
                <DropdownMenuItem onSelect={() => navigate(settingsPathForRole(role))}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogoutClick} className="text-danger focus:text-danger">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        <main className="scrollbar-thin flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:px-5 lg:px-8 lg:py-6 lg:pb-24">
          {(role === "dropshipper" || role === "vendor") && isKycPending && (
            <div className="mb-4 rounded-lg border border-warning/40 bg-warning-light/50 px-4 py-3 text-sm text-warning-dark">
              <strong>
                {kycStatus === "pending_approval" ? "KYC Pending Approval" : "KYC Required"} —
              </strong>{" "}
              {kycStatus === "pending_approval"
                ? "Your documents are under admin review. Actions are disabled until approved."
                : kycStatus === "rejected"
                  ? "Your KYC was rejected. Update documents in Settings and resubmit."
                  : "Complete KYC verification to activate your account."}{" "}
              <Link to={role === "vendor" ? "/vendor/settings" : "/dropshipper/settings"} className="font-medium underline underline-offset-2">Open KYC Settings</Link>
            </div>
          )}
          {children}
        </main>
      </div>

      <MobileBottomNav />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      {addFundsOpen && (
        <Suspense fallback={null}>
          <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
        </Suspense>
      )}
    </div>
  );
}
