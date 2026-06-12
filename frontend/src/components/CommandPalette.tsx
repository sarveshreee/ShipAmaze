import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useOrders } from "@/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import {
  Package,
  LayoutDashboard,
  Calculator,
  Truck,
  Users,
  Warehouse,
  ShoppingBag,
  IndianRupee,
  BarChart3,
  Headphones,
  Settings,
  AlertTriangle,
  Search,
  User,
  UserCog,
  MapPin,
  Shield,
} from "lucide-react";

type PalettePage = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
  staffPermission?: string | string[];
};

const pages: PalettePage[] = [
  { label: "Admin Dashboard", path: "/admin/dashboard", icon: LayoutDashboard, staffPermission: ["orders.view", "analytics.view", "products.view"] },
  { label: "Orders", path: "/admin/orders", icon: Package, staffPermission: "orders.view" },
  { label: "Add Order", path: "/admin/add-order", icon: Package, staffPermission: "orders.create" },
  { label: "NDR Management", path: "/admin/ndr", icon: AlertTriangle, staffPermission: "ndr.view" },
  { label: "Returns", path: "/admin/returns", icon: Package, staffPermission: "returns.view" },
  { label: "Channels", path: "/admin/channels", icon: Package, staffPermission: "channels.view" },
  { label: "Rates & Shipping", path: "/admin/rates", icon: Calculator, ownerOnly: true },
  { label: "Couriers", path: "/admin/couriers", icon: Truck, ownerOnly: true },
  { label: "Dropshippers", path: "/admin/dropshippers", icon: Users, ownerOnly: true },
  { label: "Vendors", path: "/admin/vendors", icon: Warehouse, ownerOnly: true },
  { label: "Users", path: "/admin/users", icon: UserCog, ownerOnly: true },
  { label: "Catalogue", path: "/admin/catalogue", icon: ShoppingBag, staffPermission: "products.view" },
  { label: "Add Product", path: "/admin/source-product", icon: Package, staffPermission: "products.create" },
  { label: "Products", path: "/admin/products", icon: ShoppingBag, staffPermission: "products.view" },
  { label: "Bulk Upload Products", path: "/admin/bulk-upload-products", icon: Package, staffPermission: "products.import" },
  { label: "Approvals", path: "/admin/approvals", icon: Shield, ownerOnly: true },
  { label: "KYC Approvals", path: "/admin/kyc", icon: Shield, ownerOnly: true },
  { label: "Permission Management", path: "/admin/permissions", icon: Shield, ownerOnly: true },
  { label: "Finance", path: "/admin/finance", icon: IndianRupee, ownerOnly: true },
  { label: "Analytics", path: "/admin/analytics", icon: BarChart3, staffPermission: "analytics.view" },
  { label: "Support", path: "/admin/support", icon: Headphones, ownerOnly: true },
  { label: "Settings", path: "/admin/settings", icon: Settings, ownerOnly: true },
  { label: "Profile", path: "/admin/profile", icon: User },
  { label: "Create Order", path: "/dropshipper/create-order", icon: Package },
  { label: "Bulk Upload", path: "/dropshipper/bulk-upload", icon: Package },
  { label: "Pickup Addresses", path: "/dropshipper/pickup-addresses", icon: MapPin },
  { label: "Track Shipment", path: "/track", icon: Search },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { role } = useAuth();
  const { isOwnerAdmin, hasAny } = useStaffPermissions();
  const { data: orders = [] } = useOrders();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const goTo = (path: string) => {
    navigate(path);
    setOpen(false);
    setSearch("");
  };

  const query = search.toLowerCase().trim();

  const filteredPages = useMemo(
    () =>
      pages.filter((p) => {
        if (!p.label.toLowerCase().includes(query)) return false;
        if (role !== "admin" || isOwnerAdmin) return true;
        if (p.ownerOnly) return false;
        if (p.staffPermission) {
          const perms = Array.isArray(p.staffPermission) ? p.staffPermission : [p.staffPermission];
          return hasAny(perms);
        }
        return !p.path.startsWith("/admin/");
      }),
    [query, role, isOwnerAdmin, hasAny]
  );

  const filteredOrders = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            o.id.toLowerCase().includes(query) ||
            o.awb.toLowerCase().includes(query) ||
            o.customer.toLowerCase().includes(query)
        )
        .slice(0, 10),
    [orders, query]
  );

  const filteredCustomers = useMemo(
    () =>
      [...new Set(orders.map((o) => o.customer))]
        .filter((name) => name.toLowerCase().includes(query))
        .slice(0, 6),
    [orders, query]
  );

  const filteredAWBs = useMemo(
    () => orders.filter((o) => o.awb.toLowerCase().includes(query)).slice(0, 6),
    [orders, query]
  );

  return (
    <CommandDialog shouldFilter={false} open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, orders, customers…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {filteredPages.map((p) => (
            <CommandItem key={p.path} onSelect={() => goTo(p.path)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {filteredOrders.length > 0 && (
          <CommandGroup heading="Orders">
            {filteredOrders.map((o) => (
              <CommandItem key={o.id} onSelect={() => goTo("/admin/orders")}>
                <Package className="mr-2 h-4 w-4" />
                {o.id} · {o.customer}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {filteredCustomers.length > 0 && (
          <CommandGroup heading="Customers">
            {filteredCustomers.map((name) => (
              <CommandItem key={name} onSelect={() => goTo("/admin/orders")}>
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {filteredAWBs.length > 0 && (
          <CommandGroup heading="AWBs">
            {filteredAWBs.map((o) => (
              <CommandItem key={o.awb} onSelect={() => goTo(`/track?awb=${encodeURIComponent(o.awb)}`)}>
                {o.awb}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
