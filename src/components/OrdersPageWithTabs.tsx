import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { OrderCardList } from "@/components/OrderCardList";
import { TableSkeleton, OrderCardSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { ProcessSelectedModal } from "@/components/ProcessSelectedModal";
import { RichOrdersTable } from "@/components/RichOrdersTable";
import { useOrders } from "@/hooks/useSupabaseData";
import { type OrderStatus, type Order } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { printShippingLabel, printBulkLabels } from "@/components/ShippingLabel";
import { downloadCSV } from "@/lib/exportUtils";

const tabs: { label: string; filter: string }[] = [
  { label: "All", filter: "all" },
  { label: "Channel", filter: "channel" },
  { label: "Manual", filter: "manual" },
  { label: "Ready to Ship", filter: "ready-to-ship" },
  { label: "In Transit", filter: "in-transit" },
  { label: "Out for Delivery", filter: "out-for-delivery" },
  { label: "Delivered", filter: "delivered" },
  { label: "Failed", filter: "failed" },
  { label: "Junk", filter: "junk" },
];

interface Props {
  breadcrumbPrefix: string;
  showActions?: boolean;
  showChannelView?: boolean;
}

export default function OrdersPageWithTabs({ breadcrumbPrefix, showActions = true, showChannelView = false }: Props) {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const { data: orders = [], isLoading: loading, refetch } = useOrders();

  const filterByTab = (o: Order, tab: string) => {
    if (tab === "all") return (o as any).status !== "junk";
    if (tab === "channel") return (o as any).source === "channel" && (o as any).status !== "junk";
    if (tab === "manual") return ((o as any).source === "manual" || !(o as any).source) && (o as any).status !== "junk";
    return o.status === tab;
  };

  const filtered = orders.filter(o => {
    if (!filterByTab(o, activeTab)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return [o.id, o.customer, o.city, o.payment, o.status, String(o.amount), o.date]
        .some(val => val != null && String(val).toLowerCase().includes(q));
    }
    return true;
  });

  const getCount = (filter: string) => orders.filter(o => filterByTab(o, filter)).length;
  const openOrder = (order: Order) => { setSelectedOrder(order); setDrawerOpen(true); };
  const toggleSelect = (id: string) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const handleMarkJunk = (id: string) => {
    const stored = JSON.parse(localStorage.getItem("shipflow_orders") || "[]");
    const updated = stored.map((o: any) => o.id === id || o.orderId === id || o.order_id === id ? { ...o, status: "junk" } : o);
    localStorage.setItem("shipflow_orders", JSON.stringify(updated));
    toast.success("Order marked as Junk");
    refetch();
  };

  const handleBulkJunk = () => {
    const stored = JSON.parse(localStorage.getItem("shipflow_orders") || "[]");
    const selectedIds = Array.from(selected);
    const updated = stored.map((o: any) => selectedIds.includes(o.id) || selectedIds.includes(o.orderId) || selectedIds.includes(o.order_id) ? { ...o, status: "junk" } : o);
    localStorage.setItem("shipflow_orders", JSON.stringify(updated));
    toast.success(`${selected.size} order(s) marked as Junk`);
    setSelected(new Set());
    refetch();
  };

  const handleExport = () => {
    const data = selected.size > 0 ? filtered.filter(o => selected.has(o.id)) : filtered;
    downloadCSV("orders_export", ["ID","Customer","City","Status","Payment","Amount","Date","AWB","Courier"], data.map(o => [o.id, o.customer, o.city, o.status, o.payment, o.amount, o.date, o.awb, o.courier]));
    toast.success(`Exported ${data.length} orders as CSV`);
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="All Orders" breadcrumb={[breadcrumbPrefix, "All Orders"]}
        actions={
          <div className="flex items-center gap-2">
            {showActions && (
              <Button onClick={handleExport} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2 hidden sm:flex"><Download className="h-4 w-4" />Export CSV</Button>
            )}
          </div>
        }
      />

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border -mx-4 px-4 lg:mx-0 lg:px-0">
        {tabs.map(tab => (
          <button key={tab.filter} onClick={() => setActiveTab(tab.filter)}
            className={cn("flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
              activeTab === tab.filter ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}>
            {tab.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs", activeTab === tab.filter ? "bg-primary-light text-primary-dark" : "bg-surface-2 text-text-muted")}>
              {getCount(tab.filter)}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="icon" className="sm:hidden shrink-0" onClick={handleExport}><Download className="h-4 w-4" /></Button>
      </div>

      {isMobile ? (
        loading ? <OrderCardSkeleton /> : (
          filtered.length === 0 ? (
            <EmptyState icon={Package} title="No orders found" description="Try adjusting your search or filter criteria" actionLabel="Clear Filters" onAction={() => { setSearch(""); setActiveTab("all"); }} />
          ) : <OrderCardList orders={filtered} onViewOrder={openOrder} />
        )
      ) : (
        <RichOrdersTable
          orders={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={(ids) => setSelected(new Set(ids))}
          onClearSelection={() => setSelected(new Set())}
          onMarkJunk={handleMarkJunk}
          onBulkJunk={handleBulkJunk}
          onOpenProcessModal={() => setProcessModalOpen(true)}
          onExport={handleExport}
          loading={loading}
          activeTab={activeTab}
          onToggleSidebar={() => window.dispatchEvent(new Event('toggle-sidebar'))}
        />
      )}

      <OrderDetailDrawer order={selectedOrder} open={drawerOpen} onClose={() => setDrawerOpen(false)} onOrderUpdated={() => { setDrawerOpen(false); }} />

      <ProcessSelectedModal
        open={processModalOpen}
        onClose={() => setProcessModalOpen(false)}
        selectedCount={selected.size}
        onSubmit={() => {
          toast.success(`Processing ${selected.size} order(s)`);
          setProcessModalOpen(false);
          setSelected(new Set());
        }}
      />
    </div>
  );
}
