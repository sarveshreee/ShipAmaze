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
import {
  Package,
  LayoutDashboard,
  Calculator,
  Truck,
  Users,
  Warehouse,
  IndianRupee,
  BarChart3,
  Headphones,
  Settings,
  AlertTriangle,
  Search,
  User,
  MapPin,
} from "lucide-react";

const pages = [
  { label: "Admin Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Orders", path: "/admin/orders", icon: Package },
  { label: "NDR Management", path: "/admin/ndr", icon: AlertTriangle },
  { label: "Rates & Shipping", path: "/admin/rates", icon: Calculator },
  { label: "Couriers", path: "/admin/couriers", icon: Truck },
  { label: "Dropshippers", path: "/admin/dropshippers", icon: Users },
  { label: "Vendors", path: "/admin/vendors", icon: Warehouse },
  { label: "Finance", path: "/admin/finance", icon: IndianRupee },
  { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
  { label: "Support", path: "/admin/support", icon: Headphones },
  { label: "Settings", path: "/admin/settings", icon: Settings },
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
  const { data: orders = [] } = useOrders();

  // #region agent log
  useEffect(() => {
    const adminCatalogueInPalette = pages.some((p) => p.path === "/admin/catalogue");
    fetch("http://127.0.0.1:7443/ingest/7b7399fc-5ef8-4a05-b389-4e13d8b0b579", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c31e0a" },
      body: JSON.stringify({
        sessionId: "c31e0a",
        location: "CommandPalette.tsx:mount",
        message: "command palette pages include admin catalogue",
        data: { adminCatalogueInPalette },
        timestamp: Date.now(),
        runId: "post-fix",
        hypothesisId: "H2",
      }),
    }).catch(() => {});
  }, []);
  // #endregion

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
    () => pages.filter((p) => p.label.toLowerCase().includes(query)),
    [query]
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
