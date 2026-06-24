import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { OrderCardList } from "@/components/OrderCardList";
import { OrderCardSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { ProcessSelectedModal } from "@/components/ProcessSelectedModal";
import { RichOrdersTable } from "@/components/RichOrdersTable";
import { useCouriers, useOrdersQuery, usePickupAddresses } from "@/hooks/useApiData";
import type { Order } from "@/types/logistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Download, Package, SlidersHorizontal, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as orderService from "@/services/orderService";
import { syncShipmentStatuses } from "@/services/velocityService";
import type { OrderListFilterValues } from "@/services/orderService";
import { errorMessageFromUnknown } from "@/lib/errorMessage";
import { orderMatchesTab } from "@/lib/orderTabFilters";
import { useVendorWarehouses } from "@/hooks/useVendorWarehouses";
import { OrderListAdvancedFilters } from "@/components/OrderListAdvancedFilters";
import { Badge } from "@/components/ui/badge";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [channelPayment, setChannelPayment] = useState<string | undefined>(undefined);
  const [channelFulfillment, setChannelFulfillment] = useState<string | undefined>(undefined);
  const [advancedFilters, setAdvancedFilters] = useState<OrderListFilterValues>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const listView = activeTab === "junk" ? "junk" : undefined;

  const advancedFiltersKey = useMemo(() => JSON.stringify(advancedFilters), [advancedFilters]);

  const effectivePayment = useMemo(() => {
    if (activeTab === "channel") return channelPayment ?? advancedFilters.payment;
    return advancedFilters.payment;
  }, [activeTab, channelPayment, advancedFilters.payment]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, channelPayment, channelFulfillment, advancedFiltersKey]);

  useEffect(() => {
    if (activeTab !== "channel") {
      setChannelPayment(undefined);
      setChannelFulfillment(undefined);
    }
  }, [activeTab]);

  const {
    data: orders = [],
    isLoading: loading,
    refetch,
    total,
    pageSize,
    tabCounts,
    error: ordersError,
  } = useOrdersQuery({
    view: listView,
    page,
    pageSize: 50,
    q: debouncedSearch || undefined,
    tab: listView === "junk" ? undefined : activeTab,
    ...advancedFilters,
    payment: effectivePayment,
    fulfillment: activeTab === "channel" ? channelFulfillment : undefined,
    counts: true,
  });
  const { data: couriers = [] } = useCouriers();
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const { data: platformPickups = [] } = usePickupAddresses({ scope: "platform" });
  const { warehouses: vendorWarehouses } = useVendorWarehouses();
  const { role } = useAuth();

  const linkedWarehouseOptions = useMemo(() => {
    if (role === "dropshipper") {
      return pickupAddresses
        .filter((p) => p.velocityWarehouseId?.trim())
        .map((p) => ({
          id: p.id,
          warehouseName: p.label,
          city: p.city,
          velocityWarehouseId: p.velocityWarehouseId,
          isDefault: p.isDefault,
        }));
    }
    if (role === "admin") {
      return platformPickups
        .filter((p) => p.isActive !== false)
        .map((p) => ({
          id: p.id,
          warehouseName: p.label,
          city: p.city,
          velocityWarehouseId: p.velocityWarehouseId,
          isDefault: p.isDefault,
        }));
    }
    return vendorWarehouses
      .filter((w) => w.velocityWarehouseId?.trim())
      .map((w) => ({
        id: w.id,
        warehouseName: w.warehouseName,
        city: w.city,
        velocityWarehouseId: w.velocityWarehouseId,
        isDefault: w.isDefault,
      }));
  }, [role, pickupAddresses, platformPickups, vendorWarehouses]);

  const isAdmin = role === "admin";
  const { canProcessOrders } = useDropshipperAccess();

  /** Admin: show Process Selected on every tab including Junk. */
  const ADMIN_PROCESS_TABS = useMemo(() => new Set(tabs.map((t) => t.filter)), []);
  const showProcessSelected = isAdmin && ADMIN_PROCESS_TABS.has(activeTab);

  const BULK_MOVE_TO_READY_TABS = new Set(["all", "channel", "manual"]);
  const showBulkMoveToReady = BULK_MOVE_TO_READY_TABS.has(activeTab) && canProcessOrders;

  useEffect(() => {
    if (ordersError) toast.error(ordersError.message);
  }, [ordersError]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setAdvancedFilters({});
    setChannelPayment(undefined);
    setChannelFulfillment(undefined);
    setPage(1);
  }, []);

  const filterTags = useMemo(() => {
    const tags: Array<{ id: string; label: string; onRemove: () => void }> = [];
    const af = advancedFilters;
    const add = (id: keyof OrderListFilterValues, label: string) => {
      const v = af[id];
      if (v == null || String(v).trim() === "") return;
      tags.push({
        id: String(id),
        label,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, [id]: undefined })),
      });
    };
    add("status", `Status: ${af.status}`);
    if (activeTab !== "channel") add("payment", `Payment: ${af.payment}`);
    add("courier", `Courier: ${af.courier}`);
    if (af.source?.trim()) {
      tags.push({
        id: "source",
        label: `Source: ${af.source}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, source: undefined })),
      });
    }
    add("dateFrom", `From: ${af.dateFrom}`);
    add("dateTo", `To: ${af.dateTo}`);
    add("customerCity", `Customer city: ${af.customerCity}`);
    add("customerState", `Customer state: ${af.customerState}`);
    add("pickupCity", `Pickup city: ${af.pickupCity}`);
    add("pickupState", `Pickup state: ${af.pickupState}`);
    add("productName", `Product: ${af.productName}`);
    add("productSku", `SKU: ${af.productSku}`);
    add("amountMin", `Min ₹: ${af.amountMin}`);
    add("amountMax", `Max ₹: ${af.amountMax}`);
    if (af.hasAwb === "yes" || af.hasAwb === "no") {
      tags.push({
        id: "hasAwb",
        label: `AWB: ${af.hasAwb === "yes" ? "Yes" : "No"}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, hasAwb: undefined })),
      });
    }
    if (af.shipmentCreated === "yes" || af.shipmentCreated === "no") {
      tags.push({
        id: "shipmentCreated",
        label: `Shipment: ${af.shipmentCreated === "yes" ? "Created" : "Not created"}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, shipmentCreated: undefined })),
      });
    }
    if (activeTab === "channel" && channelPayment?.trim()) {
      tags.push({
        id: "__chPay",
        label: `Payment: ${channelPayment}`,
        onRemove: () => setChannelPayment(undefined),
      });
    }
    if (activeTab === "channel" && channelFulfillment?.trim()) {
      tags.push({
        id: "__chFul",
        label: `Fulfillment: ${channelFulfillment}`,
        onRemove: () => setChannelFulfillment(undefined),
      });
    }
    return tags;
  }, [advancedFilters, activeTab, channelPayment, channelFulfillment]);

  const hasListFilters =
    Boolean(debouncedSearch) ||
    filterTags.length > 0 ||
    Boolean(advancedFilters.dateFrom) ||
    Boolean(advancedFilters.dateTo);

  const filterByTab = (o: Order, tab: string) => orderMatchesTab(o, tab);

  const filtered = orders;

  const selectedOrders = useMemo(() => filtered.filter((o) => selected.has(o.id)), [filtered, selected]);

  /** Tabs where Process Selected accepts orders without ready_to_ship (backend validates). */
  const RELAXED_PROCESS_TABS = useMemo(
    () => new Set(["all", "channel", "manual", "reship", "junk"]),
    []
  );

  const canProcessSelectedSelection = useMemo(() => {
    if (selectedOrders.length === 0) return false;
    const isEligible = (o: Order) => {
      if (activeTab === "junk") {
        return Boolean((o as { isJunk?: boolean }).isJunk);
      }
      if (activeTab === "all") {
        if ((o as { isJunk?: boolean }).isJunk) return true;
      } else if ((o as { isJunk?: boolean }).isJunk) {
        return false;
      }
      if (o.shipmentCreated) return false;
      if (String(o.awb ?? "").trim()) return false;
      return true;
    };
    if (RELAXED_PROCESS_TABS.has(activeTab)) {
      return selectedOrders.every(isEligible);
    }
    return selectedOrders.every((o) => {
      const st = String(o.status ?? "").toLowerCase().replace(/-/g, "_");
      const ready = st === "ready_to_ship";
      return isEligible(o) && ready;
    });
  }, [selectedOrders, activeTab, RELAXED_PROCESS_TABS]);

  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);

  const getCount = useCallback(
    (filter: string) => {
      if (tabCounts && tabCounts[filter] != null) return tabCounts[filter];
      return orders.filter((o) => filterByTab(o, filter)).length;
    },
    [tabCounts, orders]
  );
  const openOrder = (order: Order) => { setSelectedOrder(order); setDrawerOpen(true); };
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const handleMarkJunk = async (id: string) => {
    try {
      await orderService.moveOrderToJunk(id);
      toast.success("Order moved to junk");
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to junk");
    }
  };

  const handleMarkReship = async (id: string) => {
    try {
      const order = orders.find((o) => o.id === id);
      await orderService.moveOrderToReship(id);
      toast.success(
        order?.awb
          ? "Courier notified and order moved to reship"
          : "Order moved to reship"
      );
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to reship");
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

  const handleBulkDeleteJunk = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      const res = await orderService.bulkDeleteJunkOrders(ids);
      toast.success(`${res.deletedCount} order(s) permanently deleted`);
      setSelected(new Set());
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected orders");
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

  const handleMoveToReady = async (orderId: string) => {
    try {
      await orderService.updateOrderStatus(orderId, "ready_to_ship");
      toast.success("Order moved to Ready to Ship");
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order");
    }
  };

  const handleRefreshStatuses = async () => {
    if (refreshingStatuses) return;
    setRefreshingStatuses(true);
    try {
      const result = await syncShipmentStatuses(150);
      if (result.errors > 0 && result.updated === 0) {
        // All orders failed — surface the error detail so the admin can diagnose
        const detail = result.errorDetails?.[0] ?? "Check server logs for details";
        toast.error(`Tracking sync failed for ${result.errors} order${result.errors !== 1 ? "s" : ""} — ${detail}`);
      } else if (result.updated > 0 && result.errors > 0) {
        toast.warning(
          `Updated ${result.updated} status${result.updated !== 1 ? "es" : ""} · ${result.errors} failed (see server logs)`
        );
        await refetch();
      } else if (result.updated > 0) {
        toast.success(`Updated ${result.updated} shipment status${result.updated !== 1 ? "es" : ""} from Velocity`);
        await refetch();
      } else {
        toast.info(`All ${result.processed} shipment statuses are already up to date`);
      }
    } catch (err) {
      toast.error(errorMessageFromUnknown(err) || "Failed to refresh shipment statuses");
    } finally {
      setRefreshingStatuses(false);
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
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hidden sm:flex"
                    onClick={handleRefreshStatuses}
                    disabled={refreshingStatuses}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshingStatuses ? "animate-spin" : ""}`} />
                    {refreshingStatuses ? "Refreshing…" : "Refresh Tracking"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sync latest shipment statuses from Velocity (In Transit, Delivered, etc.)</TooltipContent>
              </Tooltip>
            )}
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
      {activeTab === "channel" && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <Select
            value={channelPayment ?? "__any__"}
            onValueChange={(v) => setChannelPayment(v === "__any__" ? undefined : v)}
          >
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any payment</SelectItem>
              <SelectItem value="COD">COD</SelectItem>
              <SelectItem value="Prepaid">Prepaid</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={channelFulfillment ?? "__any__"}
            onValueChange={(v) => setChannelFulfillment(v === "__any__" ? undefined : v)}
          >
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Shopify fulfillment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any fulfillment</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
              <SelectItem value="Pending Pickup">Pending Pickup</SelectItem>
              <SelectItem value="In Transit">In Transit</SelectItem>
              <SelectItem value="Out For Delivery">Out For Delivery</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search by tracking ID, order ID, order number, mobile, customer, product, SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 shrink-0">
          <div>
            <Label className="text-xs text-text-muted block mb-1">From date</Label>
            <Input
              type="date"
              className="h-9 w-[150px] text-sm"
              value={advancedFilters.dateFrom ?? ""}
              onChange={(e) =>
                setAdvancedFilters((p) => ({ ...p, dateFrom: e.target.value ? e.target.value : undefined }))
              }
              aria-label="Filter from date"
            />
          </div>
          <div>
            <Label className="text-xs text-text-muted block mb-1">To date</Label>
            <Input
              type="date"
              className="h-9 w-[150px] text-sm"
              value={advancedFilters.dateTo ?? ""}
              onChange={(e) =>
                setAdvancedFilters((p) => ({ ...p, dateTo: e.target.value ? e.target.value : undefined }))
              }
              aria-label="Filter to date"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setFilterSheetOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
        </Button>
        {hasListFilters && (
          <Button type="button" variant="ghost" size="sm" className="text-text-muted shrink-0" onClick={clearAllFilters}>
            Clear all
          </Button>
        )}
        <span className="text-xs text-text-muted whitespace-nowrap hidden sm:inline sm:ml-auto">
          {total} total
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="text-xs text-text-muted px-1">
            Page {page} / {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
        <Button variant="outline" size="icon" className="sm:hidden shrink-0" onClick={handleExport}><Download className="h-4 w-4" /></Button>
      </div>

      {filterTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {filterTags.map((t) => (
            <Badge key={t.id} variant="secondary" className="pl-2 pr-1 py-1 gap-1 font-normal text-xs max-w-full">
              <span className="truncate">{t.label}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-surface-2 shrink-0"
                aria-label={`Remove ${t.label}`}
                onClick={t.onRemove}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <OrderListAdvancedFilters
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        value={advancedFilters}
        onApply={setAdvancedFilters}
        couriers={couriers.map((c) => ({ id: c.id, name: c.name }))}
        hidePayment={activeTab === "channel"}
      />

      {isMobile ? (
        loading ? <OrderCardSkeleton /> : (
          filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No orders found for these filters."
              description="Try clearing filters or changing your search."
              actionLabel="Clear filters"
              onAction={clearAllFilters}
            />
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
          onMarkReship={handleMarkReship}
          onBulkJunk={role === "vendor" ? undefined : activeTab === "junk" ? handleBulkDeleteJunk : handleBulkJunk}
          bulkJunkLabel={activeTab === "junk" ? "Bulk Delete" : "Bulk Junk"}
          onOpenProcessModal={() => setProcessModalOpen(true)}
          onBulkMoveToReady={handleBulkMoveToReady}
          onMoveToReady={handleMoveToReady}
          onExport={handleExport}
          loading={loading}
          activeTab={activeTab}
          onToggleSidebar={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          showProcessSelected={showProcessSelected}
          processSelectedDisabled={selected.size === 0 || !canProcessSelectedSelection}
          showBulkMoveToReady={showBulkMoveToReady}
          couriers={couriers}
          warehouses={linkedWarehouseOptions}
          onOrdersChanged={async () => {
            await refetch();
          }}
          onCreateShipment={
            canProcessOrders
              ? async (payload) => {
                  const res = await orderService.createShipment(payload);
                  await refetch();
                  return res;
                }
              : undefined
          }
        />
      )}

      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        warehouses={linkedWarehouseOptions.map((w) => ({
          id: w.id,
          warehouseName: w.warehouseName,
          city: w.city,
          velocityWarehouseId: w.velocityWarehouseId,
          isDefault: w.isDefault,
        }))}
        onOrderUpdated={async () => {
          const nextOrders = await refetch();
          if (!selectedOrder) return;
          const updated = nextOrders.find((o) => o.id === selectedOrder.id) ?? null;
          setSelectedOrder(updated);
        }}
      />

      <ProcessSelectedModal
        open={processModalOpen}
        onClose={() => !processSubmitting && setProcessModalOpen(false)}
        orderIds={Array.from(selected)}
        couriers={couriers
          .filter((c) => c.active !== false)
          .map((c) => ({ id: c.id, name: c.name, carrierId: c.carrierId || undefined }))}
        referenceOrders={orders
          .filter((o) => selected.has(o.id))
          .map((o) => ({
            pincode: o.shippingPincode || o.pincode,
            payment: o.payment,
            amount: o.amount,
          }))}
        submitting={processSubmitting}
        onProcess={async (payload) => {
          setProcessSubmitting(true);
          try {
            const res = await orderService.processSelectedOrders(payload);
            toast.success(`Processed ${res.updatedCount} order(s)`);
            setProcessModalOpen(false);
            setSelected(new Set());
            await refetch();
          } catch (err: unknown) {
            toast.error(errorMessageFromUnknown(err, "Process selected failed"));
          } finally {
            setProcessSubmitting(false);
          }
        }}
      />
    </div>
  );
}
