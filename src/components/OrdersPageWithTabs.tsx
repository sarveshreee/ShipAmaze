import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { OrderCardList } from "@/components/OrderCardList";
import { TableSkeleton, OrderCardSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { BulkActionBar } from "@/components/BulkActionBar";
import { ProcessSelectedModal } from "@/components/ProcessSelectedModal";
import { useOrders } from "@/hooks/useSupabaseData";
import { type OrderStatus, type Order } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Eye, Printer, MoreHorizontal, Package, RefreshCw, FileText, Monitor, Pencil, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { printShippingLabel, printBulkLabels } from "@/components/ShippingLabel";
import { downloadCSV } from "@/lib/exportUtils";

const tabs: { label: string; status: OrderStatus | "all" }[] = [
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

const channelTabs: { label: string; status: OrderStatus | "all" }[] = [
  { label: "Pending", status: "pending" as OrderStatus },
  { label: "Ready to Ship", status: "ready-to-ship" },
  { label: "Reship", status: "rts" as OrderStatus },
  { label: "Failed", status: "cancelled" },
  { label: "Fulfilled", status: "delivered" },
  { label: "Junk", status: "draft" },
  { label: "On Process", status: "on-process" as OrderStatus },
];

interface Props {
  breadcrumbPrefix: string;
  showActions?: boolean;
  showChannelView?: boolean;
}

export default function OrdersPageWithTabs({ breadcrumbPrefix, showActions = true, showChannelView = false }: Props) {
  const [viewMode, setViewMode] = useState<"orders" | "channel">(showChannelView ? "orders" : "orders");
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [channelTab, setChannelTab] = useState<OrderStatus | "all">("ready-to-ship");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const { data: orders = [], isLoading: loading } = useOrders();

  const currentTabs = viewMode === "channel" ? channelTabs : tabs;
  const currentActiveTab = viewMode === "channel" ? channelTab : activeTab;
  const setCurrentTab = viewMode === "channel" 
    ? (s: OrderStatus | "all") => setChannelTab(s) 
    : (s: OrderStatus | "all") => setActiveTab(s);

  const filtered = orders.filter(o => {
    if (currentActiveTab !== "all" && o.status !== currentActiveTab) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return [o.id, o.customer, o.city, o.payment, o.status, String(o.amount), o.date]
        .some(val => val != null && String(val).toLowerCase().includes(q));
    }
    return true;
  });

  const getCount = (status: string) => status === "all" ? orders.length : orders.filter(o => o.status === status).length;
  const openOrder = (order: Order) => { setSelectedOrder(order); setDrawerOpen(true); };
  const toggleSelect = (id: string) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  const handleExport = () => {
    const data = selected.size > 0 ? filtered.filter(o => selected.has(o.id)) : filtered;
    downloadCSV("orders_export", ["ID","Customer","City","Status","Payment","Amount","Date","AWB","Courier"], data.map(o => [o.id, o.customer, o.city, o.status, o.payment, o.amount, o.date, o.awb, o.courier]));
    toast.success(`Exported ${data.length} orders as CSV`);
  };

  const handleBulkPrint = () => { const sel = filtered.filter(o => selected.has(o.id)); printBulkLabels(sel); toast.success(`Printing ${sel.length} label(s)`); };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title={viewMode === "channel" ? "Channel Orders" : "All Orders"} breadcrumb={[breadcrumbPrefix, viewMode === "channel" ? "Channel Orders" : "All Orders"]}
        actions={
          <div className="flex items-center gap-2">
            {showChannelView && (
              <div className="hidden sm:flex gap-1 mr-2">
                <Button variant={viewMode === "orders" ? "default" : "outline"} size="sm" onClick={() => setViewMode("orders")}>Orders</Button>
                <Button variant={viewMode === "channel" ? "default" : "outline"} size="sm" onClick={() => setViewMode("channel")}>Channel Orders</Button>
              </div>
            )}
            {/* Channel view action bar */}
            {viewMode === "channel" && selected.size > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-primary">
                  <Monitor className="h-4 w-4" /> Count Order: {selected.size}
                </span>
                <Button size="sm" onClick={handleExport} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1.5">
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1.5">
                  <Package className="h-3.5 w-3.5" />Process Bulk Orders
                </Button>
                <Button size="sm" onClick={() => setProcessModalOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1.5">
                  <Package className="h-3.5 w-3.5" />Process Selected
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1.5">
                  Bulk Junk
                </Button>
              </div>
            )}
            {viewMode !== "channel" && showActions && (
              <Button onClick={handleExport} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2 hidden sm:flex"><Download className="h-4 w-4" />Export CSV</Button>
            )}
          </div>
        }
      />

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border -mx-4 px-4 lg:mx-0 lg:px-0">
        {currentTabs.map(tab => (
          <button key={tab.status} onClick={() => setCurrentTab(tab.status)}
            className={cn("flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
              currentActiveTab === tab.status ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}>
            {tab.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs", currentActiveTab === tab.status ? "bg-primary-light text-primary-dark" : "bg-surface-2 text-text-muted")}>
              {getCount(tab.status)}
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
            <EmptyState icon={Package} title="No orders found" description="Try adjusting your search or filter criteria" actionLabel="Clear Filters" onAction={() => { setSearch(""); setCurrentTab("all"); }} />
          ) : <OrderCardList orders={filtered} onViewOrder={openOrder} />
        )
      ) : viewMode === "channel" ? (
        /* Channel Orders table view */
        <div className="rounded-lg bg-card shadow-card overflow-hidden">
          <div className="text-sm text-text-muted px-4 py-2 border-b border-border">
            Showing: <strong className="text-text-primary">{filtered.length} of {filtered.length} record(s)</strong>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="p-3 text-left w-10">
                    <input type="checkbox" className="rounded border-border accent-primary"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(filtered.map(o => o.id)) : new Set())} />
                  </th>
                  <th className="p-3 text-left font-medium text-text-secondary">Order Details</th>
                  <th className="p-3 text-left font-medium text-text-secondary">
                    <span className="flex items-center gap-1.5">Products Details <Filter className="h-3.5 w-3.5 text-primary cursor-pointer" /></span>
                  </th>
                  <th className="p-3 text-left font-medium text-text-secondary">
                    <span className="flex items-center gap-1.5">Amount Details <Filter className="h-3.5 w-3.5 text-primary cursor-pointer" /></span>
                  </th>
                  <th className="p-3 text-left font-medium text-text-secondary">
                    <span className="flex items-center gap-1.5">Address <Filter className="h-3.5 w-3.5 text-primary cursor-pointer" /></span>
                  </th>
                  <th className="p-3 text-left font-medium text-text-secondary">Remarks</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Communication</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <TableSkeleton rows={10} columns={7} /> : filtered.length === 0 ? (
                  <tr><td colSpan={7}>
                    <EmptyState icon={Package} title="No orders found" description="Try adjusting your search or filter criteria" actionLabel="Clear Filters" onAction={() => { setSearch(""); setCurrentTab("all"); }} />
                  </td></tr>
                ) : filtered.map(o => (
                  <tr key={o.id} className={cn("border-b border-border last:border-0 hover:bg-surface-2/30 transition-colors", selected.has(o.id) && "bg-primary-light/30")}>
                    <td className="p-3">
                      <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td className="p-3">
                      <div>
                        <a href={`/order-detail?id=${o.id}`} target="_blank" className="text-primary text-xs font-medium hover:underline">{o.awb}</a>
                        <p className="text-xs text-text-muted mt-0.5">{o.date}</p>
                        <p className="text-xs text-text-muted">Order #{o.id}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="relative">
                        <Pencil className="h-3 w-3 text-primary absolute -top-1 right-0 cursor-pointer" />
                        {o.products?.[0] && (
                          <div>
                            <p className="text-xs text-text-muted">SKU: <span className="text-text-primary">{o.products[0].name?.slice(0, 12)}</span></p>
                            <p className="text-xs text-text-muted">QTY: {o.products[0].qty}</p>
                            <p className="text-xs text-text-primary mt-0.5">{o.products[0].name}</p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="relative">
                        <Pencil className="h-3 w-3 text-primary absolute -top-1 right-0 cursor-pointer" />
                        <p className="text-xs text-text-secondary">Order Amt.: <strong className="text-text-primary">₹{o.amount}</strong></p>
                        {o.payment === "COD" && <p className="text-xs text-text-secondary">COD Amt.: <strong className="text-text-primary">₹{o.amount}</strong></p>}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="relative">
                        <Pencil className="h-3 w-3 text-primary absolute -top-1 right-0 cursor-pointer" />
                        <p className="text-xs text-text-primary font-medium">{o.customer}</p>
                        <p className="text-xs text-text-muted">{o.address}</p>
                        <p className="text-xs text-text-muted">{o.city}, {o.pincode}</p>
                        <p className="text-xs text-primary mt-0.5">{o.phone}</p>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-text-muted">—</td>
                    <td className="p-3 text-xs text-text-muted">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="p-3 text-left w-10">
                    <input type="checkbox" className="rounded border-border accent-primary"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(filtered.map(o => o.id)) : new Set())} />
                  </th>
                  <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Amount</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <TableSkeleton rows={10} columns={8} /> : filtered.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={Package} title="No orders found" description="Try adjusting your search or filter criteria" actionLabel="Clear Filters" onAction={() => { setSearch(""); setCurrentTab("all"); }} />
                  </td></tr>
                ) : filtered.map(o => (
                  <tr key={o.id} className={cn("border-b border-border last:border-0 hover:bg-surface-2/30 transition-colors", selected.has(o.id) && "bg-primary-light/30")}>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-light shrink-0">
                          <Package className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-mono text-xs text-primary font-medium">{o.id}</span>
                      </div>
                    </td>
                    <td className="p-3"><div><p className="text-text-primary font-medium">{o.customer}</p><p className="text-xs text-text-muted">{o.city}</p></div></td>
                    <td className="p-3"><PaymentBadge type={o.payment} /></td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3 font-medium text-text-primary">₹{o.amount}</td>
                    <td className="p-3 text-text-muted text-xs">{o.date}</td>
                    <td className="p-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-primary hover:bg-primary-light" onClick={() => window.open(`/order-detail?id=${o.id}`, '_blank')}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-secondary hover:bg-secondary-light" onClick={() => { printShippingLabel(o); toast.success("Printing label..."); }}><Printer className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-3 text-sm text-text-secondary">
            <span>Showing 1–{filtered.length} of {filtered.length} orders</span>
          </div>
        </div>
      )}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleBulkPrint}>
          <Printer className="h-3.5 w-3.5" /> Print Labels
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { toast.success(`Status updated for ${selected.size} order(s)`); setSelected(new Set()); }}>
          <RefreshCw className="h-3.5 w-3.5" /> Update Status
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleExport}>
          <FileText className="h-3.5 w-3.5" /> Export
        </Button>
      </BulkActionBar>

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
