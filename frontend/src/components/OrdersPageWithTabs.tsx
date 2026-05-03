import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { OrderCardList } from "@/components/OrderCardList";
import { OrderCardSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { ProcessSelectedModal } from "@/components/ProcessSelectedModal";
import { RichOrdersTable } from "@/components/RichOrdersTable";
import { useCouriers, useOrders } from "@/hooks/useApiData";
import type { Order } from "@/types/logistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import * as orderService from "@/services/orderService";
import { useVendorWarehouses } from "@/hooks/useVendorWarehouses";

const tabs: { label: string; filter: string }[] = [
  { label: "All", filter: "all" },
  { label: "Channel", filter: "channel" },
  { label: "Manual", filter: "manual" },
  { label: "Ready to Ship", filter: "ready-to-ship" },
  { label: "Pending Pickup", filter: "pending-pickup" },
  { label: "In Transit", filter: "in-transit" },
  { label: "Out for Delivery", filter: "out-for-delivery" },
  { label: "Delivered", filter: "delivered" },
  { label: "Reship", filter: "reship" },
  { label: "Failed", filter: "failed" },
  { label: "Junk", filter: "junk" },
];

interface Props {
  breadcrumbPrefix: string;
  showActions?: boolean;
  showChannelView?: boolean;
}

export default function OrdersPageWithTabs({ breadcrumbPrefix, showActions = true }: Props) {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const listView = activeTab === "junk" ? "junk" : undefined;
  const { data: orders = [], isLoading: loading, refetch } = useOrders(listView);
  const { data: couriers = [] } = useCouriers();
  const { warehouses } = useVendorWarehouses();
  const { role } = useAuth();

  const isAdmin = role === "admin";

  // Operational processing actions are restricted to specific tabs
  const PROCESS_TABS = new Set(["ready-to-ship", "pending-pickup", "in-transit", "out-for-delivery"]);
  const tabAllowsProcessing = PROCESS_TABS.has(activeTab);

  // Process Selected: admin only
  const showProcessSelected = isAdmin && tabAllowsProcessing;

  const BULK_MOVE_TO_READY_TABS = new Set(["all", "channel", "manual"]);
  const showBulkMoveToReady = BULK_MOVE_TO_READY_TABS.has(activeTab);

  const filterByTab = (o: Order, tab: string) => {
    const status = (o as any).status;
    const isReship = status === "reship";
    const isJunk = Boolean((o as any).isJunk);
    const channel = ((o as any).channel as string | undefined) ?? "";
    const externalSource = ((o as any).externalSource as string | undefined) ?? "";
    if (tab === "all") return !isJunk && !isReship;
    if (tab === "channel") return (channel === "Shopify" || externalSource === "shopify") && !isJunk && !isReship;
    if (tab === "manual") return !(channel === "Shopify" || externalSource === "shopify") && !isJunk && !isReship;
    if (tab === "pending-pickup") {
      return !!(o as any).courier && !isJunk && !isReship && (status === "pending-pickup" || (status === "ready-to-ship" && !(o as any).picked_up));
    }
    if (tab === "reship") return isReship;
    if (tab === "junk") return isJunk;
    return status === tab;
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
  const handleMarkJunk = async (id: string) => {
    try {
      await orderService.moveOrderToJunk(id);
      toast.success("Order moved to junk");
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to junk");
    }
  };

  const handleBulkJunk = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => orderService.moveOrderToJunk(id)));
      toast.success(`${ids.length} order(s) moved to junk`);
      setSelected(new Set());
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process selected orders");
    }
  };

  const handleBulkMoveToReady = async () => {
    const orderIds = Array.from(selected);
    if (!orderIds.length) return;
    try {
      await orderService.bulkMoveOrders(orderIds, "ready_to_ship");
      toast.success("Orders moved to Ready to Ship");
      setSelected(new Set());
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move orders");
    }
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
          <button key={tab.filter} onClick={() => { setActiveTab(tab.filter); }}
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
          onBulkMoveToReady={handleBulkMoveToReady}
          onExport={handleExport}
          loading={loading}
          activeTab={activeTab}
          onToggleSidebar={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          showProcessSelected={showProcessSelected}
          showBulkMoveToReady={showBulkMoveToReady}
          couriers={couriers}
          warehouses={warehouses}
          onCreateShipment={async (payload) => {
            await orderService.createShipment(payload);
            await refetch();
          }}
        />
      )}

      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOrderUpdated={async () => {
          const refreshed = await refetch();
          const nextOrders = refreshed.data ?? [];
          if (!selectedOrder) return;
          const updated = nextOrders.find((o) => o.id === selectedOrder.id) ?? null;
          setSelectedOrder(updated);
        }}
      />

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
