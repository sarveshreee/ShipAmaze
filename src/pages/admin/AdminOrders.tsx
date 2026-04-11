import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { KPICardSkeleton, TableSkeleton } from "@/components/SkeletonLoaders";
import { orders, type OrderStatus, type Order } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Eye, Printer, MoreHorizontal, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: { label: string; status?: OrderStatus | "all" }[] = [
  { label: "All", status: "all" },
  { label: "Ready to Ship", status: "ready-to-ship" },
  { label: "Not Picked", status: "not-picked" },
  { label: "In Transit", status: "in-transit" },
  { label: "Out for Delivery", status: "out-for-delivery" },
  { label: "Delivered", status: "delivered" },
  { label: "NDR", status: "ndr" },
  { label: "RTO", status: "rto" },
  { label: "Cancelled", status: "cancelled" },
  { label: "Draft", status: "draft" },
];

export default function AdminOrders() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const filtered = orders.filter(o => {
    if (activeTab !== "all" && o.status !== activeTab) return false;
    if (search && !o.id.toLowerCase().includes(search.toLowerCase()) && !o.customer.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getCount = (status: string) => status === "all" ? orders.length : orders.filter(o => o.status === status).length;

  const openOrder = (order: Order) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Orders" breadcrumb={["Admin", "Orders"]}
        actions={<Button className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"><Download className="h-4 w-4" />Export CSV</Button>}
      />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border">
        {tabs.map(tab => (
          <button key={tab.status} onClick={() => setActiveTab(tab.status!)}
            className={cn("flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
              activeTab === tab.status
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}>
            {tab.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs", activeTab === tab.status ? "bg-primary-light text-primary-dark" : "bg-surface-2 text-text-muted")}>
              {getCount(tab.status!)}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
                <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
                <th className="p-3 text-left font-medium text-text-secondary">Pincode</th>
                <th className="p-3 text-left font-medium text-text-secondary">Weight</th>
                <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
                <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
                <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={10} columns={9} />
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30 transition-colors cursor-pointer group"
                    onClick={() => openOrder(o)}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-light shrink-0">
                          <Package className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-mono text-xs text-primary font-medium">{o.id}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="text-text-primary font-medium">{o.customer}</p>
                        <p className="text-xs text-text-muted">{o.city}</p>
                      </div>
                    </td>
                    <td className="p-3 text-text-secondary">{o.pincode}</td>
                    <td className="p-3 text-text-secondary">{o.weight}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-success" />
                        <span className="text-text-secondary">{o.courier}</span>
                      </div>
                    </td>
                    <td className="p-3"><PaymentBadge type={o.payment} /></td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3 text-text-muted text-xs">{o.date}</td>
                    <td className="p-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-primary hover:bg-primary-light"
                          onClick={() => openOrder(o)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-secondary hover:bg-secondary-light">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-text-primary">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border p-3 text-sm text-text-secondary">
          <span>Showing 1–{filtered.length} of {filtered.length} orders</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm" disabled>Next</Button>
          </div>
        </div>
      </div>

      <OrderDetailDrawer order={selectedOrder} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
