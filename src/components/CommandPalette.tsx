import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { orders } from "@/data/mockData";
import {
  Package, LayoutDashboard, ShoppingBag, Calculator, Truck, Users,
  Warehouse, IndianRupee, BarChart3, Headphones, Settings, AlertTriangle,
  Search, User
} from "lucide-react";

const pages = [
  { label: "Admin Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Orders", path: "/admin/orders", icon: Package },
  { label: "NDR Management", path: "/admin/ndr", icon: AlertTriangle },
  { label: "Catalogue", path: "/admin/catalogue", icon: ShoppingBag },
  { label: "Rates & Shipping", path: "/admin/rates", icon: Calculator },
  { label: "Couriers", path: "/admin/couriers", icon: Truck },
  { label: "Dropshippers", path: "/admin/dropshippers", icon: Users },
  { label: "Vendors", path: "/admin/vendors", icon: Warehouse },
  { label: "Finance", path: "/admin/finance", icon: IndianRupee },
  { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
  { label: "Support", path: "/admin/support", icon: Headphones },
  { label: "Settings", path: "/admin/settings", icon: Settings },
  { label: "Create Order", path: "/dropshipper/create-order", icon: Package },
  { label: "Bulk Upload", path: "/dropshipper/bulk-upload", icon: Package },
  { label: "Track Shipment", path: "/track", icon: Search },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const goTo = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const recentOrders = orders.slice(0, 8);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search orders, customers, pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map(p => (
            <CommandItem key={p.path} onSelect={() => goTo(p.path)} className="gap-2">
              <p.icon className="h-4 w-4 text-text-muted" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Recent Orders">
          {recentOrders.map(o => (
            <CommandItem key={o.id} onSelect={() => goTo("/admin/orders")} className="gap-2">
              <Package className="h-4 w-4 text-text-muted" />
              <span className="font-mono text-xs">{o.id}</span>
              <span className="text-text-secondary">—</span>
              <span>{o.customer}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Customers">
          {[...new Set(orders.map(o => o.customer))].slice(0, 6).map(name => (
            <CommandItem key={name} onSelect={() => goTo("/admin/orders")} className="gap-2">
              <User className="h-4 w-4 text-text-muted" />
              {name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
