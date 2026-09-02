import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OrderDetailDrawer } from "@/components/OrderDetailDrawer";
import { OrderCardList } from "@/components/OrderCardList";
import { OrderCardSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { ProcessSelectedModal } from "@/components/ProcessSelectedModal";
import { RichOrdersTable } from "@/components/RichOrdersTable";
import { useCouriers, useOrdersQuery, usePickupAddresses } from "@/hooks/useApiData";
import type { Order } from "@/types/logistics";
import { sortOrdersNewestFirst } from "@/lib/orderListTimestamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Download, Package, SlidersHorizontal, X, RefreshCw, Loader2, Truck, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
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
import { isOrderReadyToShip, orderMatchesTab } from "@/lib/orderTabFilters";
import { orderMissingSku } from "@/lib/orderSkuValidation";
import {
  normalizePincode,
  useServiceableOrdersFilter,
  type ServiceabilityCourierFilter,
} from "@/lib/orderServiceabilityFilter";
import { useVendorWarehouses } from "@/hooks/useVendorWarehouses";
import { OrderListAdvancedFilters } from "@/components/OrderListAdvancedFilters";
import { OrderFieldSearch } from "@/components/OrderFieldSearch";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { printShippingLabel } from "@/components/ShippingLabel";
import * as userService from "@/services/userService";
import * as vendorService from "@/services/vendorService";
import { buildOrderFilterTags, hasActiveListFilters } from "@/lib/orderListFilterUtils";
import { refetchOrdersAndDashboard } from "@/lib/refetchEvents";
import { useQuery } from "@tanstack/react-query";

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
  { label: "NDR", filter: "ndr" },
  { label: "RTO", filter: "rto" },
  { label: "Junk", filter: "junk" },
];

/** Tabs where bulk process + courier serviceability filter apply. */
const SERVICEABILITY_FILTER_TABS = new Set(["all", "channel", "manual", "ready-to-ship"]);

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

function MobileSelectCountControl({
  max,
  onApply,
}: {
  max: number;
  onApply: (count: number) => void;
}) {
  const [value, setValue] = useState("");
  const apply = () => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Enter a valid number of orders to select");
      return;
    }
    onApply(Math.min(n, max));
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-medium text-text-secondary">Select</span>
      <Input
        type="number"
        min={1}
        max={max}
        inputMode="numeric"
        placeholder="e.g. 95"
        className="h-7 w-[4.5rem] text-xs px-2 bg-background"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        aria-label="Number of orders to select"
      />
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={apply}>
        Go
      </Button>
    </div>
  );
}

interface Props {
  breadcrumbPrefix: string;
  showActions?: boolean;
  showChannelView?: boolean;
}

export default function OrdersPageWithTabs({ breadcrumbPrefix, showActions = true }: Props) {
  const { role, userId } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [channelPayment, setChannelPayment] = useState<string | undefined>(undefined);
  const [channelFulfillment, setChannelFulfillment] = useState<string | undefined>(undefined);
  const [advancedFilters, setAdvancedFilters] = useState<OrderListFilterValues>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [serviceabilityPickupId, setServiceabilityPickupId] = useState("");
  const [serviceabilityCourierId, setServiceabilityCourierId] = useState("");
  const [exporting, setExporting] = useState(false);
  const isMobile = useIsMobile();
  const ordersTabsRef = useRef<HTMLDivElement>(null);
  const listView = activeTab === "junk" ? "junk" : undefined;

  const advancedFiltersKey = useMemo(() => JSON.stringify(advancedFilters), [advancedFilters]);
  const [switchingTab, setSwitchingTab] = useState(false);

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
  }, [activeTab, debouncedSearch, channelPayment, channelFulfillment, advancedFiltersKey, serviceabilityPickupId, serviceabilityCourierId, pageSize]);

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab, debouncedSearch, channelPayment, channelFulfillment, advancedFiltersKey, serviceabilityPickupId, serviceabilityCourierId]);

  useEffect(() => {
    if (activeTab !== "channel") {
      setChannelPayment(undefined);
      setChannelFulfillment(undefined);
    }
  }, [activeTab]);

  const {
    data: orders = [],
    isLoading: loading,
    isFetching,
    refetch,
    total,
    tabCounts,
    error: ordersError,
  } = useOrdersQuery({
    view: listView,
    page,
    pageSize,
    q: debouncedSearch || undefined,
    tab: listView === "junk" ? undefined : activeTab,
    ...advancedFilters,
    payment: effectivePayment,
    fulfillment: activeTab === "channel" ? channelFulfillment : undefined,
    counts: true,
  });

  const facetQueryParams = useMemo(
    () => ({
      view: listView,
      tab: listView === "junk" ? undefined : activeTab,
      q: debouncedSearch || undefined,
      ...advancedFilters,
      payment: effectivePayment,
      fulfillment: activeTab === "channel" ? channelFulfillment : undefined,
    }),
    [
      listView,
      activeTab,
      debouncedSearch,
      advancedFilters,
      effectivePayment,
      channelFulfillment,
    ]
  );

  const { data: filterFacets, isFetching: facetsLoading } = useQuery({
    queryKey: ["orderFilterFacets", userId, JSON.stringify(facetQueryParams)],
    queryFn: ({ signal }) => orderService.getOrderFilterFacets(facetQueryParams, { signal }),
    staleTime: 30_000,
  });

  const patchListFilters = useCallback((patch: Partial<OrderListFilterValues>) => {
    setAdvancedFilters((prev) => {
      const next = { ...prev, ...patch };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") delete next[k as keyof OrderListFilterValues];
      }
      return next;
    });
  }, []);

  // Refresh list when order status is updated from /order-detail (new tab) or sibling windows.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === "shipamaze:order-updated") {
        void refetch({ includeCounts: true });
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "shipamaze_order_updated" && event.newValue) {
        void refetch({ includeCounts: true });
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [refetch]);

  useEffect(() => {
    if (orders.length > 0 || (!loading && !isFetching)) setSwitchingTab(false);
  }, [isFetching, loading, activeTab, orders.length]);
  const { data: couriers = [] } = useCouriers();
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const { data: platformPickups = [] } = usePickupAddresses({ scope: "platform" });
  const { warehouses: vendorWarehouses } = useVendorWarehouses();
  const [dropshipperOptions, setDropshipperOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [vendorOptions, setVendorOptions] = useState<Array<{ id: string; label: string }>>([]);

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
  const { canProcessOrders, canProcessSelected, isDropshipper } = useDropshipperAccess();

  const pickupFilterOptions = useMemo(() => {
    if (role === "admin") return platformPickups.filter((p) => p.isActive !== false);
    if (role === "dropshipper") return pickupAddresses.filter((p) => p.isActive !== false);
    return pickupAddresses.filter((p) => p.isActive !== false);
  }, [role, platformPickups, pickupAddresses]);

  const showServiceabilityFilter = SERVICEABILITY_FILTER_TABS.has(activeTab) && isAdmin;

  useEffect(() => {
    if (!showServiceabilityFilter) {
      setServiceabilityPickupId("");
      setServiceabilityCourierId("");
      return;
    }
    if (serviceabilityPickupId) return;
    const defaultPickup =
      pickupFilterOptions.find((p) => p.isDefault && p.velocityWarehouseId?.trim()) ??
      pickupFilterOptions.find((p) => p.velocityWarehouseId?.trim()) ??
      pickupFilterOptions.find((p) => p.isDefault) ??
      pickupFilterOptions[0];
    if (defaultPickup) setServiceabilityPickupId(defaultPickup.id);
  }, [showServiceabilityFilter, pickupFilterOptions, serviceabilityPickupId]);

  const serviceabilityFilter = useMemo((): ServiceabilityCourierFilter | null => {
    if (!showServiceabilityFilter || !serviceabilityCourierId || serviceabilityCourierId === "__any__") {
      return null;
    }
    const pickup = pickupFilterOptions.find((p) => p.id === serviceabilityPickupId);
    const pickupPin = normalizePincode(pickup?.pincode);
    if (pickupPin.length !== 6) return null;
    const courier = couriers.find((c) => c.id === serviceabilityCourierId);
    if (!courier) return null;
    return {
      pickupPincode: pickupPin,
      carrierId: courier.carrierId || undefined,
      courierName: courier.name,
    };
  }, [
    showServiceabilityFilter,
    serviceabilityCourierId,
    serviceabilityPickupId,
    pickupFilterOptions,
    couriers,
  ]);

  const {
    filteredOrders: serviceabilityFilteredOrders,
    loading: serviceabilityLoading,
    active: serviceabilityFilterActive,
  } = useServiceableOrdersFilter(orders, serviceabilityFilter);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void Promise.all([
      userService.listUsersByRole("dropshipper"),
      vendorService.listVendors(),
    ]).then(([dropshippers, vendors]) => {
      if (cancelled) return;
      setDropshipperOptions(dropshippers.map((d) => ({
        id: d.user_id,
        label: d.full_name || d.business_name || d.user_id,
      })));
      setVendorOptions(vendors.map((v) => ({
        id: v.id,
        label: v.name || v.id,
      })));
    }).catch((err) => {
      if (!cancelled) {
        toast.error(errorMessageFromUnknown(err) || "Failed to load dropshipper/vendor filter options");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  /** Admin: show Process Selected on every tab including Junk. */
  const ADMIN_PROCESS_TABS = useMemo(() => new Set(tabs.map((t) => t.filter)), []);
  const DROPSHIPPER_PROCESS_TABS = useMemo(
    () => new Set(["all", "channel", "manual", "reship", "ready-to-ship", "failed"]),
    []
  );
  const showProcessSelected =
    (isAdmin && ADMIN_PROCESS_TABS.has(activeTab)) ||
    (isDropshipper && canProcessSelected && DROPSHIPPER_PROCESS_TABS.has(activeTab));

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
    setServiceabilityCourierId("");
    setPage(1);
  }, []);

  const filterTags = useMemo(
    () =>
      buildOrderFilterTags(advancedFilters, {
        onPatch: patchListFilters,
        searchQ: debouncedSearch,
        onRemoveSearch: () => setSearch(""),
        activeTab,
        channelPayment,
        channelFulfillment,
        dropshipperLabel: (id) => dropshipperOptions.find((d) => d.id === id)?.label ?? id,
        vendorLabel: (id) => vendorOptions.find((v) => v.id === id)?.label ?? id,
        serviceabilityLabel: serviceabilityFilterActive
          ? `Serviceable: ${couriers.find((c) => c.id === serviceabilityCourierId)?.name ?? "courier"} · ${
              pickupFilterOptions.find((p) => p.id === serviceabilityPickupId)?.label ?? "pickup"
            }`
          : undefined,
        onRemoveServiceability: serviceabilityFilterActive
          ? () => setServiceabilityCourierId("")
          : undefined,
        onRemoveChannelPayment: () => setChannelPayment(undefined),
        onRemoveChannelFulfillment: () => setChannelFulfillment(undefined),
      }),
    [
      advancedFilters,
      patchListFilters,
      debouncedSearch,
      activeTab,
      channelPayment,
      channelFulfillment,
      dropshipperOptions,
      vendorOptions,
      serviceabilityFilterActive,
      serviceabilityCourierId,
      serviceabilityPickupId,
      couriers,
      pickupFilterOptions,
    ]
  );

  const hasListFilters =
    hasActiveListFilters(advancedFilters, { q: debouncedSearch }) || serviceabilityFilterActive;

  const filterByTab = (o: Order, tab: string) => orderMatchesTab(o, tab);

  /** Newest timestamp for this tab/date-type first (date, then time) — matches row clock. */
  const filtered = useMemo(() => {
    const list = serviceabilityFilterActive ? serviceabilityFilteredOrders : orders;
    return sortOrdersNewestFirst(list, activeTab, advancedFilters.dateType);
  }, [
    serviceabilityFilterActive,
    serviceabilityFilteredOrders,
    orders,
    activeTab,
    advancedFilters.dateType,
  ]);

  const selectedOrders = useMemo(() => filtered.filter((o) => selected.has(o.id)), [filtered, selected]);

  /** Tabs where Process Selected accepts orders without ready_to_ship (backend validates). */
  const RELAXED_PROCESS_TABS = useMemo(
    () => new Set(["all", "channel", "manual", "reship", "junk", "ready-to-ship", "failed"]),
    []
  );

  const canProcessSelectedSelection = useMemo(() => {
    if (selected.size === 0) return false;
    // Off-page / select-all-matching: allow; backend validates each order.
    if (selectedOrders.length === 0) return true;
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
    return selectedOrders.every((o) => isEligible(o) && isOrderReadyToShip(o));
  }, [selected.size, selectedOrders, activeTab, RELAXED_PROCESS_TABS]);

  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ done: number; total: number } | null>(null);
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);

  const getCount = useCallback(
    (filter: string) => {
      if (tabCounts && tabCounts[filter] != null) return tabCounts[filter];
      return orders.filter((o) => orderMatchesTab(o, filter)).length;
    },
    [tabCounts, orders]
  );
  const showOrdersSkeleton = (switchingTab && orders.length === 0) || (loading && orders.length === 0);
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
      await refetch({ includeCounts: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to junk");
    }
  };

  const handleMarkReship = async (id: string) => {
    try {
      const order = orders.find((o) => o.id === id);
      const res = await orderService.moveOrderToReship(id);
      const pc = res.providerCancel;
      if (order?.awb && pc?.attempted && !pc.success) {
        toast.warning(
          `Moved to Reship, but ${pc.provider} cancel failed: ${pc.message || "unknown error"}`
        );
      } else {
        toast.success(
          order?.awb ? "Order cancelled on courier and moved to Reship" : "Order moved to Reship"
        );
      }
      await refetch({ includeCounts: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to reship");
    }
  };

  const handleBulkJunk = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const results = await Promise.allSettled(ids.map((id) => orderService.moveOrderToJunk(id)));
      const failed = results.filter((result) => result.status === "rejected");
      const moved = ids.length - failed.length;
      if (moved > 0) toast.success(`${moved} order(s) moved to junk`);
      if (failed.length > 0) {
        const first = failed[0] as PromiseRejectedResult;
        toast.error(first.reason instanceof Error ? first.reason.message : `${failed.length} order(s) could not be moved to junk`);
      }
      setSelected(new Set());
      await refetch({ includeCounts: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process selected orders");
    }
  };

  const handleBulkDeleteJunk = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const res = await orderService.bulkDeleteJunkOrders(ids);
      toast.success(`${res.deletedCount} order(s) permanently deleted`);
      setSelected(new Set());
      await refetch({ includeCounts: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected orders");
    }
  };

  const handleBulkMoveToReady = async () => {
    const orderIds = [...selected];
    if (!orderIds.length) return;
    try {
      await orderService.bulkMoveOrders(orderIds, "ready_to_ship");
      toast.success("Orders moved to Ready to Ship");
      setSelected(new Set());
      await refetch({ includeCounts: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move orders");
    }
  };

  const handleMoveToReady = async (orderId: string) => {
    try {
      await orderService.updateOrderStatus(orderId, "ready_to_ship");
      toast.success("Order moved to Ready to Ship");
      await refetch({ includeCounts: true });
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
        await refetch({ includeCounts: true });
      } else if (result.updated > 0) {
        toast.success(
          `Updated ${result.updated} shipment status${result.updated !== 1 ? "es" : ""} from courier tracking`
        );
        await refetch({ includeCounts: true });
      } else {
        toast.info(`All ${result.processed} shipment statuses are already up to date`);
      }
    } catch (err) {
      toast.error(errorMessageFromUnknown(err) || "Failed to refresh shipment statuses");
    } finally {
      setRefreshingStatuses(false);
    }
  };

  const exportFilterParams = useCallback((): orderService.ListOrdersParams => {
    const listView = activeTab === "junk" ? "junk" as const : undefined;
    return {
      view: listView,
      q: debouncedSearch || undefined,
      tab: listView === "junk" ? undefined : activeTab,
      ...advancedFilters,
      payment: effectivePayment,
      fulfillment: activeTab === "channel" ? channelFulfillment : undefined,
      counts: false,
    };
  }, [activeTab, debouncedSearch, advancedFilters, effectivePayment, channelFulfillment]);

  const handleSelectAllMatching = useCallback(async (limit?: number) => {
    try {
      const requested = limit != null ? Math.floor(limit) : 1000;
      const cappedLimit = Math.min(Math.max(1, requested), 1000);
      const res = await orderService.listOrderIds({ ...exportFilterParams(), limit: cappedLimit });
      setSelected(new Set(res.ids));
      // Only warn when "select all" (or >1000 request) hit the hard 1,000 cap — not when user asked for e.g. 95 of 327.
      if (res.capped && (limit == null || requested > 1000)) {
        toast.warning(`Selected first ${res.ids.length} of ${res.total} matching orders (max 1,000 per bulk action)`);
      } else {
        toast.success(`Selected ${res.ids.length} order${res.ids.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(errorMessageFromUnknown(err) || "Failed to select matching orders");
    }
  }, [exportFilterParams]);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (selected.size > 0) {
        await orderService.exportOrdersCsvByIds([...selected]);
        toast.success(`Exported ${selected.size} selected order${selected.size === 1 ? "" : "s"} as CSV`);
      } else {
        await orderService.exportOrdersCsv(exportFilterParams());
        toast.success(total > 0 ? `Exported all ${total} matching orders as CSV` : "Export complete");
      }
    } catch (err) {
      toast.error(errorMessageFromUnknown(err) || "Export failed");
    } finally {
      setExporting(false);
    }
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
                <TooltipContent>Sync latest AWB statuses from Velocity, Ekart, and Lorrigo</TooltipContent>
              </Tooltip>
            )}
            {showActions && (
              <Button
                onClick={() => void handleExport()}
                disabled={exporting}
                className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2 hidden sm:flex"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            )}
          </div>
        }
      />

      {/* Filters + tabs — unified card; tabs stick flush below header when scrolling */}
      <div className="-mx-4 px-4 sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8 mb-3">
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-secondary/[0.06] shadow-md">
          <div className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70" />
              <Input
                placeholder="Search tracking, order ID, customer, product, SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 border-primary/20 bg-background/80 focus-visible:ring-primary/30"
                aria-label="Search orders"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-primary/80 block mb-1">
                  Date Type
                </Label>
                <Select
                  value={advancedFilters.dateType?.trim() ? advancedFilters.dateType : "choose"}
                  onValueChange={(v) =>
                    setAdvancedFilters((p) => ({
                      ...p,
                      dateType:
                        v === "choose"
                          ? undefined
                          : (v as "placed" | "pickup" | "delivered"),
                    }))
                  }
                >
                  <SelectTrigger
                    className="h-9 w-[130px] text-sm border-secondary/25 bg-background/80"
                    aria-label="Date type"
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="choose">Choose</SelectItem>
                    <SelectItem value="placed">Placed</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-primary/80 block mb-1">From</Label>
                <Input
                  type="date"
                  className="h-9 w-[140px] text-sm border-secondary/25 bg-background/80"
                  value={advancedFilters.dateFrom ?? ""}
                  onChange={(e) =>
                    setAdvancedFilters((p) => ({ ...p, dateFrom: e.target.value ? e.target.value : undefined }))
                  }
                  aria-label="Filter from date"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-primary/80 block mb-1">To</Label>
                <Input
                  type="date"
                  className="h-9 w-[140px] text-sm border-secondary/25 bg-background/80"
                  value={advancedFilters.dateTo ?? ""}
                  onChange={(e) =>
                    setAdvancedFilters((p) => ({ ...p, dateTo: e.target.value ? e.target.value : undefined }))
                  }
                  aria-label="Filter to date"
                />
              </div>
            </div>
          </div>

          <OrderFieldSearch
            searchField={advancedFilters.searchField}
            searchValue={advancedFilters.searchValue}
            onChange={(field, value) =>
              patchListFilters({
                searchField: field,
                searchValue: value.trim() ? value : undefined,
              })
            }
          />

          <div className="flex flex-wrap gap-2 items-end pb-1">
            {activeTab !== "channel" && (
              <Select
                value={advancedFilters.payment?.trim() ? advancedFilters.payment : "__any__"}
                onValueChange={(v) =>
                  setAdvancedFilters((p) => ({ ...p, payment: v === "__any__" ? undefined : v }))
                }
              >
                <SelectTrigger className="h-10 w-[130px] text-xs bg-card text-text-primary border-border/60 shadow-sm">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem value="__any__">Any payment</SelectItem>
                  <SelectItem value="COD">COD</SelectItem>
                  <SelectItem value="Prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select
              value={advancedFilters.status?.trim() ? advancedFilters.status : "__any__"}
              onValueChange={(v) =>
                setAdvancedFilters((p) => ({ ...p, status: v === "__any__" ? undefined : v }))
              }
            >
              <SelectTrigger className="h-10 w-[140px] text-xs bg-card text-text-primary border-border/60 shadow-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                <SelectItem value="__any__">Any status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="ready-to-ship">Ready to ship</SelectItem>
                <SelectItem value="pending-pickup">Pending pickup</SelectItem>
                <SelectItem value="in-transit">In transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="ndr">NDR</SelectItem>
                <SelectItem value="rto">RTO</SelectItem>
                <SelectItem value="reship">Reship</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={advancedFilters.courier?.trim() ? advancedFilters.courier : "__any__"}
              onValueChange={(v) =>
                setAdvancedFilters((p) => ({ ...p, courier: v === "__any__" ? undefined : v }))
              }
            >
              <SelectTrigger className="h-10 w-[150px] text-xs bg-card text-text-primary border-border/60 shadow-sm">
                <SelectValue placeholder="Courier" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                <SelectItem value="__any__">Any courier</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && vendorOptions.length > 0 && (
              <Select
                value={advancedFilters.vendorId?.trim() ? advancedFilters.vendorId : "__any__"}
                onValueChange={(v) =>
                  setAdvancedFilters((p) => ({ ...p, vendorId: v === "__any__" ? undefined : v }))
                }
              >
                <SelectTrigger className="h-10 w-[160px] text-xs bg-card text-text-primary border-border/60 shadow-sm">
                  <SelectValue placeholder="Vendor" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem value="__any__">Any vendor</SelectItem>
                  {vendorOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && dropshipperOptions.length > 0 && (
              <Select
                value={advancedFilters.dropshipperId?.trim() ? advancedFilters.dropshipperId : "__any__"}
                onValueChange={(v) =>
                  setAdvancedFilters((p) => ({ ...p, dropshipperId: v === "__any__" ? undefined : v }))
                }
              >
                <SelectTrigger className="h-10 w-[170px] text-xs bg-card text-text-primary border-border/60 shadow-sm">
                  <SelectValue placeholder="Dropshipper" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem value="__any__">Any dropshipper</SelectItem>
                  {dropshipperOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 h-10 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              More filters
            </Button>
            {hasListFilters && (
              <Button type="button" variant="ghost" size="sm" className="text-text-secondary h-10" onClick={clearAllFilters}>
                Clear all
              </Button>
            )}
            {isFetching && !loading && (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-label="Loading orders" />
            )}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto pt-1 sm:pt-0">
              <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
                {serviceabilityFilterActive && !serviceabilityLoading
                  ? `${filtered.length} shown · ${total} total`
                  : `${total} total`}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[100px] text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 shrink-0 rounded-lg border border-border/60 bg-card/80 px-1.5 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="text-xs font-medium text-text-primary px-1 tabular-nums">
                  {page} / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={loading || page * pageSize >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          {activeTab === "channel" && (
            <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-border/40">
              <Select
                value={channelPayment ?? "__any__"}
                onValueChange={(v) => setChannelPayment(v === "__any__" ? undefined : v)}
              >
                <SelectTrigger className="w-[160px] h-9 text-sm bg-background/80">
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
                <SelectTrigger className="w-[180px] h-9 text-sm bg-background/80">
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

          {showServiceabilityFilter && (
            <div className="rounded-lg border border-secondary/25 bg-secondary/[0.08] p-2.5 sm:p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">
                Courier serviceability
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[200px] flex-1 sm:flex-none">
                  <Label className="text-xs font-semibold text-text-primary block mb-1.5">
                    Pickup for serviceability
                  </Label>
                  <Select
                    value={serviceabilityPickupId || "__none__"}
                    onValueChange={(v) => setServiceabilityPickupId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="w-full sm:w-[240px] h-10 text-sm border-secondary/35 bg-card text-text-primary shadow-sm">
                      <SelectValue placeholder="Select pickup…" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground">
                      <SelectItem value="__none__">Select pickup…</SelectItem>
                      {pickupFilterOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[200px] flex-1 sm:flex-none">
                  <Label className="text-xs font-semibold text-text-primary block mb-1.5">
                    Serviceable courier
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={serviceabilityCourierId || "__any__"}
                      onValueChange={(v) => setServiceabilityCourierId(v === "__any__" ? "" : v)}
                      disabled={!serviceabilityPickupId}
                    >
                      <SelectTrigger className="w-full sm:w-[240px] h-10 text-sm border-secondary/35 bg-card text-text-primary shadow-sm disabled:opacity-50">
                        <SelectValue placeholder="All couriers" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover text-popover-foreground">
                        <SelectItem value="__any__">All couriers</SelectItem>
                        {couriers
                          .filter((c) => c.active !== false)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {serviceabilityLoading && (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary shrink-0" aria-label="Checking serviceability" />
                    )}
                  </div>
                </div>
                {serviceabilityFilterActive && !serviceabilityLoading && (
                  <p className="text-xs font-medium text-text-primary flex items-center gap-1.5 pb-1 sm:ml-auto">
                    <Truck className="h-3.5 w-3.5 text-secondary shrink-0" />
                    {filtered.length} serviceable on this page
                  </p>
                )}
              </div>
            </div>
          )}

          </div>

          <div
            ref={ordersTabsRef}
            className="sticky top-0 z-30 border-t border-primary/15 bg-background/95 backdrop-blur-md shadow-sm rounded-b-xl"
          >
            <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.filter}
                  type="button"
                  onClick={() => {
                    if (tab.filter === activeTab) return;
                    setSwitchingTab(true);
                    setActiveTab(tab.filter);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-semibold transition-all rounded-lg border-b-2",
                    activeTab === tab.filter
                      ? "border-primary text-primary bg-primary/10"
                      : "border-transparent text-text-secondary hover:text-primary hover:bg-primary/5"
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-bold min-w-[1.25rem] text-center",
                      activeTab === tab.filter ? "bg-primary text-white" : "bg-surface-2 text-text-muted"
                    )}
                  >
                    {getCount(tab.filter)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <OrderListAdvancedFilters
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        value={advancedFilters}
        onApply={setAdvancedFilters}
        couriers={couriers.map((c) => ({ id: c.id, name: c.name }))}
        dropshippers={isAdmin ? dropshipperOptions : []}
        vendors={isAdmin ? vendorOptions : []}
        hidePayment={activeTab === "channel"}
      />

      {ordersError && !showOrdersSkeleton ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-danger/5 px-6 py-12 text-center">
          <p className="font-semibold text-text-primary">Couldn’t load orders</p>
          <p className="max-w-md text-sm text-text-secondary">
            {ordersError.message || "The request timed out or failed. Retry without reloading the page."}
          </p>
          <Button type="button" onClick={() => void refetch({ includeCounts: true })}>
            Retry
          </Button>
        </div>
      ) : isMobile ? (
        showOrdersSkeleton ? <OrderCardSkeleton /> : (
          filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title={
                serviceabilityFilterActive
                  ? "No serviceable orders on this page for that courier."
                  : "No orders found for these filters."
              }
              description={
                serviceabilityFilterActive
                  ? "Try another courier, change pickup, or clear the serviceability filter."
                  : "Try clearing filters or changing your search."
              }
              actionLabel="Clear filters"
              onAction={clearAllFilters}
            />
          ) : (
            <div className="space-y-3 pb-16">
              {selected.size > 0 && (
                <div className="sticky top-0 z-20 rounded-lg border border-primary/20 bg-card/95 backdrop-blur px-3 py-2.5 space-y-2 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-2 text-xs text-white">
                      {selected.size}
                    </span>
                    selected
                    {total > filtered.length && selected.size < Math.min(total, 1000) && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary hover:underline"
                        onClick={() => void handleSelectAllMatching()}
                      >
                        Select all {Math.min(total, 1000)} matching
                      </button>
                    )}
                    {total > 0 && (
                      <MobileSelectCountControl
                        max={Math.min(total, 1000)}
                        onApply={(n) => void handleSelectAllMatching(n)}
                      />
                    )}
                    <button
                      type="button"
                      className="ml-auto text-xs text-text-muted hover:text-text-primary"
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {showProcessSelected && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={!canProcessSelectedSelection}
                        onClick={() => setProcessModalOpen(true)}
                      >
                        <CheckSquare className="h-3.5 w-3.5" /> Process
                      </Button>
                    )}
                    {showBulkMoveToReady && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void handleBulkMoveToReady()}>
                        Ready to Ship
                      </Button>
                    )}
                    {role !== "vendor" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-danger border-danger/40"
                        onClick={() => void (activeTab === "junk" ? handleBulkDeleteJunk() : handleBulkJunk())}
                      >
                        {activeTab === "junk" ? "Delete" : "Junk"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <OrderCardList
                orders={filtered}
                onViewOrder={openOrder}
                onPrintOrder={(o) => {
                  void printShippingLabel(o).catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Label failed")
                  );
                }}
                selected={selected}
                onToggleSelect={toggleSelect}
                onSelectAllVisible={(ids) => setSelected(new Set(ids))}
                onClearSelection={() => setSelected(new Set())}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-text-secondary">
                    {total === 0
                      ? "Showing 0 of 0 orders"
                      : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} orders`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-secondary whitespace-nowrap">Rows per page</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[72px] text-xs bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {total > pageSize ? (
                  <div className="flex items-center gap-1.5 shrink-0 rounded-lg border border-border/60 bg-card px-1.5 py-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <span className="text-xs font-medium text-text-primary px-1 tabular-nums">
                      {page} / {Math.max(1, Math.ceil(total / pageSize))}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      disabled={loading || page * pageSize >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        )
      ) : (
        <RichOrdersTable
          orders={filtered}
          listFilters={advancedFilters}
          onListFiltersChange={patchListFilters}
          activeFilterTags={filterTags}
          filterFacets={filterFacets}
          facetsLoading={facetsLoading}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={(ids) => setSelected(new Set(ids))}
          onSelectAllMatching={(limit) => void handleSelectAllMatching(limit)}
          totalMatching={total}
          page={page}
          pageSize={pageSize}
          totalCount={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onClearSelection={() => setSelected(new Set())}
          onMarkJunk={handleMarkJunk}
          onMarkReship={handleMarkReship}
          onBulkJunk={role === "vendor" ? undefined : activeTab === "junk" ? handleBulkDeleteJunk : handleBulkJunk}
          bulkJunkLabel={activeTab === "junk" ? "Bulk Delete" : "Bulk Junk"}
          onOpenProcessModal={() => {
            if (serviceabilityFilterActive) {
              const visibleIds = new Set(filtered.map((o) => o.id));
              const outsideFilter = [...selected].filter((id) => !visibleIds.has(id));
              if (outsideFilter.length > 0) {
                toast.warning(
                  `${outsideFilter.length} selected order(s) are not serviceable for the current courier filter and may fail at booking.`
                );
              }
            }
            setProcessModalOpen(true);
          }}
          onBulkMoveToReady={handleBulkMoveToReady}
          onMoveToReady={activeTab === "ready-to-ship" ? undefined : handleMoveToReady}
          onExport={handleExport}
          activeTab={activeTab}
          dateType={advancedFilters.dateType}
          showProcessSelected={showProcessSelected}
          processSelectedDisabled={selected.size === 0 || !canProcessSelectedSelection}
          showBulkMoveToReady={showBulkMoveToReady}
          couriers={couriers}
          warehouses={linkedWarehouseOptions}
          onOrdersChanged={async () => {
            await refetch({ includeCounts: true });
            refetchOrdersAndDashboard();
          }}
          onViewOrder={openOrder}
          onCreateShipment={
            canProcessOrders
              ? async (payload) => {
                  const res = await orderService.createShipment(payload);
                  await refetch({ includeCounts: true });
                  return res;
                }
              : undefined
          }
          loading={showOrdersSkeleton}
          isRefreshing={isFetching && orders.length > 0 && !switchingTab}
          emptyDescription={
            serviceabilityFilterActive
              ? "No orders on this page are serviceable for the selected courier from this pickup."
              : undefined
          }
        />
      )}

      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fullscreen={isMobile}
        warehouses={linkedWarehouseOptions.map((w) => ({
          id: w.id,
          warehouseName: w.warehouseName,
          city: w.city,
          velocityWarehouseId: w.velocityWarehouseId,
          isDefault: w.isDefault,
        }))}
        onOrderUpdated={async () => {
          const nextOrders = await refetch({ includeCounts: true });
          if (!selectedOrder) return;
          const updated = nextOrders.find((o) => o.id === selectedOrder.id) ?? null;
          setSelectedOrder(updated);
        }}
      />

      <ProcessSelectedModal
        open={processModalOpen}
        onClose={() => !processSubmitting && setProcessModalOpen(false)}
        orderIds={Array.from(selected)}
        initialPickupId={serviceabilityPickupId || undefined}
        initialCourierCarrierId={
          serviceabilityFilterActive
            ? couriers.find((c) => c.id === serviceabilityCourierId)?.carrierId
            : undefined
        }
        fixedCourierFromFilter={
          serviceabilityFilterActive && serviceabilityPickupId && serviceabilityCourierId
            ? (() => {
                const c = couriers.find((x) => x.id === serviceabilityCourierId);
                if (!c?.name) return undefined;
                return {
                  pickupId: serviceabilityPickupId,
                  courierName: c.name,
                  carrierId: c.carrierId || undefined,
                };
              })()
            : undefined
        }
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
        selectedOrders={selectedOrders}
        submitting={processSubmitting}
        processProgress={processProgress}
        onProcess={async (payload) => {
          if (selectedOrders.length > 0) {
            const missingSku = selectedOrders
              .filter((o) => orderMissingSku(o))
              .map((o) => o.orderId ?? o.id);
            if (missingSku.length > 0) {
              toast.error("SKU is mandatory before processing shipment.", {
                description: `Missing SKU on: ${missingSku.join(", ")}`,
                duration: 10000,
              });
              return;
            }
          }
          setProcessSubmitting(true);
          setProcessProgress({ done: 0, total: payload.orderIds.length });
          try {
            const res = await orderService.processSelectedOrdersBatched(payload, (done, total) => {
              setProcessProgress({ done, total });
            });

            if (res.updatedCount > 0) {
              const parts = [`Processed ${res.updatedCount} of ${res.total} order(s)`];
              if (res.skipped.length > 0) parts.push(`${res.skipped.length} skipped`);
              if (res.failed.length > 0) parts.push(`${res.failed.length} failed`);
              if (res.failed.length > 0) {
                toast.warning(parts.join(" · "));
                const firstFail = res.failed[0];
                if (firstFail) {
                  toast.error(`${firstFail.orderId}: ${firstFail.error}`, { duration: 8000 });
                }
              } else {
                toast.success(parts.join(" · "));
              }
            } else if (res.failed.length > 0) {
              toast.error(`All ${res.failed.length} order(s) failed to process`);
              const firstFail = res.failed[0];
              if (firstFail) {
                toast.error(`${firstFail.orderId}: ${firstFail.error}`, { duration: 8000 });
              }
            } else if (res.skipped.length > 0) {
              toast.info(`All ${res.skipped.length} order(s) were already processed or not eligible`);
            }

            for (const warning of res.pickupLinkWarnings ?? []) {
              toast.warning(
                `Pickup address is not linked to ${warning.provider === "lorrigo" ? "Lorrigo" : "Velocity"}: ${warning.error}`,
                {
                  description:
                    "Orders that can ship via a different courier were still processed. Use Sync / Retry Sync on this pickup address to fix this permanently.",
                  duration: 10000,
                }
              );
            }

            if (res.updatedCount > 0 || res.failed.length > 0) {
              setProcessModalOpen(false);
              setSelected(new Set());
            }
            await refetch({ includeCounts: true });
          } catch (err: unknown) {
            toast.error(errorMessageFromUnknown(err, "Process selected failed"));
          } finally {
            setProcessSubmitting(false);
            setProcessProgress(null);
          }
        }}
      />
    </div>
  );
}
