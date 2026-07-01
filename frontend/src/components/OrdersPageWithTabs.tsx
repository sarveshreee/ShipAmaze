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
import { Search, Download, Package, SlidersHorizontal, X, RefreshCw, Loader2, Truck } from "lucide-react";
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
import { isOrderReadyToShip, orderMatchesTab } from "@/lib/orderTabFilters";
import {
  normalizePincode,
  useServiceableOrdersFilter,
  type ServiceabilityCourierFilter,
} from "@/lib/orderServiceabilityFilter";
import { useVendorWarehouses } from "@/hooks/useVendorWarehouses";
import { OrderListAdvancedFilters } from "@/components/OrderListAdvancedFilters";
import { Badge } from "@/components/ui/badge";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import * as userService from "@/services/userService";
import * as vendorService from "@/services/vendorService";

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

/** Tabs where bulk process + courier serviceability filter apply. */
const SERVICEABILITY_FILTER_TABS = new Set(["all", "channel", "manual", "ready-to-ship"]);

const ORDER_EXPORT_HEADERS = [
  "Order Account",
  "OrderId",
  "Channel Order Number",
  "Channel Order Date",
  "WayBill Number",
  "Pre Generated WayBill",
  "Order Date",
  "Ref.Invoice #",
  "Mode",
  "Express",
  "Pickup Warehouse",
  "Consignee Name",
  "Consignee Contact",
  "Alternate Number",
  "Address",
  "City",
  "State",
  "Pincode",
  "Product Name",
  "SKU",
  "Product Qty",
  "Product Value",
  "Order Amount",
  "Extra Charges",
  "Total Amount",
  "COD Amount",
  "Dimensions",
  "Weight",
  "Fulfilled By",
  "Status",
  "Added On",
  "Delivered Date",
  "RTS Date",
  "Client Order ID",
];

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function firstText(...values: unknown[]): string {
  return text(values.find((value) => text(value).trim() !== ""));
}

function extra(order: Order, key: string): unknown {
  return (order as unknown as Record<string, unknown>)[key];
}

function pickupObject(order: Order, pickupOptions: Array<Record<string, unknown>>) {
  if (order.pickupAddress && typeof order.pickupAddress === "object") {
    return order.pickupAddress as unknown as Record<string, unknown>;
  }
  const pickupId = firstText(order.pickupAddressId, extra(order, "pickupWarehouseId"));
  return pickupOptions.find((pickup) => firstText(pickup.id, pickup._id) === pickupId) ?? null;
}

function orderProducts(order: Order): Array<Record<string, unknown>> {
  const candidates = [
    order.products,
    order.items,
    order.orderItems,
    extra(order, "shopifyLineItems"),
  ];
  const found = candidates.find((value) => Array.isArray(value) && value.length > 0);
  return Array.isArray(found) ? (found as Array<Record<string, unknown>>) : [];
}

function productValue(order: Order, keys: string[]): string {
  return orderProducts(order)
    .map((product) => firstText(...keys.map((key) => product[key])))
    .filter(Boolean)
    .join(" | ");
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function productTotal(order: Order, keys: string[]): number {
  return orderProducts(order).reduce((total, product) => {
    const value = keys.map((key) => product[key]).find((v) => numberValue(v) > 0);
    return total + numberValue(value);
  }, 0);
}

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
  const [serviceabilityPickupId, setServiceabilityPickupId] = useState("");
  const [serviceabilityCourierId, setServiceabilityCourierId] = useState("");
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
  }, [activeTab, debouncedSearch, channelPayment, channelFulfillment, advancedFiltersKey, serviceabilityPickupId, serviceabilityCourierId]);

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
  const { canProcessOrders } = useDropshipperAccess();

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
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

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
    setServiceabilityCourierId("");
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
    if (af.dropshipperId?.trim()) {
      const label = dropshipperOptions.find((d) => d.id === af.dropshipperId)?.label ?? af.dropshipperId;
      tags.push({
        id: "dropshipperId",
        label: `Dropshipper: ${label}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, dropshipperId: undefined })),
      });
    }
    if (af.vendorId?.trim()) {
      const label = vendorOptions.find((v) => v.id === af.vendorId)?.label ?? af.vendorId;
      tags.push({
        id: "vendorId",
        label: `Vendor: ${label}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, vendorId: undefined })),
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
    if (serviceabilityFilterActive) {
      const pickupLabel =
        pickupFilterOptions.find((p) => p.id === serviceabilityPickupId)?.label ?? "pickup";
      const courierLabel = couriers.find((c) => c.id === serviceabilityCourierId)?.name ?? "courier";
      tags.push({
        id: "__svcCourier",
        label: `Serviceable: ${courierLabel} · ${pickupLabel}`,
        onRemove: () => setServiceabilityCourierId(""),
      });
    }
    return tags;
  }, [
    advancedFilters,
    activeTab,
    channelPayment,
    channelFulfillment,
    dropshipperOptions,
    vendorOptions,
    serviceabilityFilterActive,
    serviceabilityPickupId,
    serviceabilityCourierId,
    pickupFilterOptions,
    couriers,
  ]);

  const hasListFilters =
    Boolean(debouncedSearch) ||
    filterTags.length > 0 ||
    Boolean(advancedFilters.dateFrom) ||
    Boolean(advancedFilters.dateTo) ||
    serviceabilityFilterActive;

  const filterByTab = (o: Order, tab: string) => orderMatchesTab(o, tab);

  const filtered = serviceabilityFilterActive ? serviceabilityFilteredOrders : orders;

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
    return selectedOrders.every((o) => isEligible(o) && isOrderReadyToShip(o));
  }, [selectedOrders, activeTab, RELAXED_PROCESS_TABS]);

  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ done: number; total: number } | null>(null);
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
          ? "Order cancelled and moved to Reship"
          : "Order moved to Reship"
      );
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to move order to reship");
    }
  };

  const handleBulkJunk = async () => {
    const ids = selectedOrders.map((order) => order.id);
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
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process selected orders");
    }
  };

  const handleBulkDeleteJunk = async () => {
    const ids = selectedOrders.map((order) => order.id);
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
    const orderIds = selectedOrders.map((order) => order.id);
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
    const pickupOptions = [...pickupAddresses, ...platformPickups, ...vendorWarehouses] as unknown as Array<Record<string, unknown>>;
    downloadCSV("orders_export", ORDER_EXPORT_HEADERS, data.map((o) => {
      const pickup = pickupObject(o, pickupOptions);
      const courier = firstText(o.courierName, o.courier, extra(o, "addedCourier"));
      const totalAmount = Number(o.amount || 0);
      const codAmount = o.payment === "COD" ? totalAmount : firstText(extra(o, "codAmount"), o.codCharges);
      const extraCharges = numberValue(o.shippingCharges) + numberValue(o.codCharges);
      const productPriceTotal = productTotal(o, ["price", "productPrice", "value", "productValue"]);

      return [
        firstText(o.shopifyShopDomain, o.externalSource, extra(o, "orderAccount")),
        firstText(o.externalOrderName, o.id),
        firstText(o.externalOrderName, o.shopifyOrderNumericId, extra(o, "channelOrderNumber")),
        firstText(extra(o, "channelOrderDate"), o.lastShopifySyncAt, o.date),
        firstText(o.awb, o.trackingId),
        firstText(extra(o, "preGeneratedWaybill"), o.trackingId),
        o.date,
        firstText(o.shopifyOrderNumericId, extra(o, "invoiceNumber"), extra(o, "refInvoice")),
        o.payment,
        firstText(extra(o, "express"), extra(o, "serviceType")),
        firstText(
          typeof o.pickupAddress === "string" ? o.pickupAddress : "",
          pickup?.label,
          pickup?.warehouseName,
          pickup?.pickupName
        ),
        o.customer,
        firstText(o.customerPhone, o.phone),
        firstText(extra(o, "customerNumber2"), extra(o, "phone2"), extra(o, "alternatePhone")),
        firstText(o.shippingAddress1, o.address),
        firstText(o.shippingCity, o.city),
        firstText(o.shippingState, o.state),
        firstText(o.shippingPincode, o.pincode),
        productValue(o, ["productName", "name"]),
        productValue(o, ["sku", "productCode"]),
        productValue(o, ["qty", "quantity"]),
        productPriceTotal || productValue(o, ["price", "productPrice", "value", "productValue"]),
        totalAmount,
        extraCharges || "",
        totalAmount + extraCharges,
        codAmount,
        firstText(o.dimensions, [o.length, o.breadth ?? o.width, o.height].filter(Boolean).join("x")),
        o.weight,
        firstText(extra(o, "fulfilledBy"), courier),
        firstText(o.shopifyFulfillmentStatus, o.shipmentStatus, o.status),
        firstText(extra(o, "createdAt"), o.movedToReadyAt, o.updatedAt, o.date),
        firstText(extra(o, "deliveryDate"), extra(o, "deliveredAt"), o.edd),
        firstText(extra(o, "rtsDate"), extra(o, "rtsAt")),
        firstText(extra(o, "clientOrderId"), o.externalOrderName, o.shopifyOrderNumericId),
      ];
    }));
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

      {showServiceabilityFilter && (
        <div className="flex flex-wrap gap-2 mb-3 items-end">
          <div>
            <Label className="text-xs text-text-muted block mb-1">Pickup for serviceability</Label>
            <Select
              value={serviceabilityPickupId || "__none__"}
              onValueChange={(v) => setServiceabilityPickupId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-[220px] h-9 text-sm">
                <SelectValue placeholder="Select pickup…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select pickup…</SelectItem>
                {pickupFilterOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-text-muted block mb-1">Serviceable courier</Label>
            <div className="flex items-center gap-2">
              <Select
                value={serviceabilityCourierId || "__any__"}
                onValueChange={(v) => setServiceabilityCourierId(v === "__any__" ? "" : v)}
                disabled={!serviceabilityPickupId}
              >
                <SelectTrigger className="w-[220px] h-9 text-sm">
                  <SelectValue placeholder="All couriers" />
                </SelectTrigger>
                <SelectContent>
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
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-label="Checking serviceability" />
              )}
            </div>
          </div>
          {serviceabilityFilterActive && !serviceabilityLoading && (
            <p className="text-xs text-text-muted flex items-center gap-1.5 pb-1">
              <Truck className="h-3.5 w-3.5" />
              Showing {filtered.length} order{filtered.length !== 1 ? "s" : ""} serviceable on this page
            </p>
          )}
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
          {serviceabilityFilterActive && !serviceabilityLoading
            ? `${filtered.length} shown · ${total} total`
            : `${total} total`}
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
        dropshippers={isAdmin ? dropshipperOptions : []}
        vendors={isAdmin ? vendorOptions : []}
        hidePayment={activeTab === "channel"}
      />

      {isMobile ? (
        loading || serviceabilityLoading ? <OrderCardSkeleton /> : (
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
          loading={loading || serviceabilityLoading}
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
        submitting={processSubmitting}
        processProgress={processProgress}
        onProcess={async (payload) => {
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

            if (res.updatedCount > 0) {
              setProcessModalOpen(false);
              setSelected(new Set());
            }
            await refetch();
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
