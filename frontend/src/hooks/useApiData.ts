import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as orderService from "@/services/orderService";
import type { OrdersListMeta, OrderListFilterValues } from "@/services/orderService";
import * as manifestService from "@/services/manifestService";
import * as invoiceService from "@/services/invoiceService";
import * as weightDisputeService from "@/services/weightDisputeService";
import * as walletService from "@/services/walletService";
import * as ndrService from "@/services/ndrService";
import * as returnService from "@/services/returnService";
import * as productService from "@/services/productService";
import * as courierService from "@/services/courierService";
import * as pickupService from "@/services/pickupService";
import * as pincodeService from "@/services/pincodeService";
import type {
  Order,
  Manifest,
  Invoice,
  WeightDispute,
  Transaction,
  ReturnOrder,
  CODRemittance,
  PickupAddress,
  PincodeService,
} from "@/types/logistics";
import type { WalletSummary } from "@/services/walletService";

type QueryStatus = "pending" | "success" | "error";

const AUTO_REFETCH_INTERVAL_MS = 10 * 60 * 1000;

interface SimpleQueryResult<T> {
  data: T[];
  error: Error | null;
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  status: QueryStatus;
  refetch: () => Promise<void>;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("Failed to load data");
}

function toIsoDateString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function useApiQuery<T>(key: string, queryFn: () => Promise<T[]>): SimpleQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await queryFn();
      setData(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err) {
      setError(toError(err));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [queryFn]);

  // Allow any part of the app to request a refetch for this query key
  // (e.g. after syncing Shopify orders).
  useEffect(() => {
    const eventName = `shipamaze:refetch:${key}`;
    const isOrdersQuery = key.startsWith("orders:");
    const fallbackOrdersEvent = "shipamaze:refetch:orders";
    const handler = () => {
      void load();
    };
    window.addEventListener(eventName, handler);
    if (isOrdersQuery) {
      window.addEventListener(fallbackOrdersEvent, handler);
    }
    return () => {
      window.removeEventListener(eventName, handler);
      if (isOrdersQuery) {
        window.removeEventListener(fallbackOrdersEvent, handler);
      }
    };
  }, [key, load]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      setIsLoading(true);
      try {
        const result = await queryFn();
        if (!isMounted) return;
        setData(Array.isArray(result) ? result : []);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(toError(err));
        setData([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [key, queryFn]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFETCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return useMemo(
    () => ({
      data,
      error,
      isLoading,
      isPending: isLoading,
      isError: !!error,
      isSuccess: !isLoading && !error,
      status: isLoading ? "pending" : error ? "error" : "success",
      refetch: load,
    }),
    [data, error, isLoading, load]
  );
}

function mapOrderRow(o: Record<string, unknown>): Order {
  return {
    id: String(o.id ?? o.orderId ?? ""),
    customer: String(o.customer ?? ""),
    phone: String(o.phone ?? ""),
    address: String(o.address ?? ""),
    city: String(o.city ?? ""),
    state: o.state != null ? String(o.state) : undefined,
    pincode: String(o.pincode ?? ""),
    weight: String(o.weight ?? ""),
    length: o.length !== undefined && o.length !== null ? Number(o.length) : undefined,
    width: o.width !== undefined && o.width !== null ? Number(o.width) : undefined,
    breadth: o.breadth !== undefined && o.breadth !== null ? Number(o.breadth) : undefined,
    height: o.height !== undefined && o.height !== null ? Number(o.height) : undefined,
    courier: (o.courier as Order["courier"]) || "Delhivery",
    payment: (o.payment as Order["payment"]) || "Prepaid",
    status: (o.status as Order["status"]) || "pending",
    date: String(o.date ?? ""),
    awb: String(o.awb ?? ""),
    amount: Number(o.amount ?? 0),
    products: (o.products as Order["products"]) || [],
    dimensions: o.dimensions as string | undefined,
    zone: o.zone as string | undefined,
    pickupAddress:
      typeof o.pickupAddress === "string" || (typeof o.pickupAddress === "object" && o.pickupAddress !== null)
        ? (o.pickupAddress as Order["pickupAddress"])
        : undefined,
    channel: o.channel as string | undefined,
    externalSource: o.externalSource as string | undefined,
    externalOrderName: o.externalOrderName as string | undefined,
    shipmentCreated: Boolean(o.shipmentCreated),
    shipmentId: o.shipmentId as string | undefined,
    trackingId: o.trackingId as string | undefined,
    pickupAddressId: o.pickupAddressId != null ? String(o.pickupAddressId) : undefined,
    isJunk: Boolean(o.isJunk),
    junkedAt: o.junkedAt as string | undefined,
    junkReason: o.junkReason as string | undefined,
    shipmentStatus: o.shipmentStatus as string | undefined,
    movedToReadyAt:
      o.movedToReadyAt != null
        ? typeof o.movedToReadyAt === "string"
          ? (o.movedToReadyAt as string)
          : new Date(o.movedToReadyAt as Date).toISOString()
        : undefined,
    customerEmail: o.customerEmail != null ? String(o.customerEmail) : undefined,
    customerPhone: o.customerPhone != null ? String(o.customerPhone) : undefined,
    shippingAddress1: o.shippingAddress1 != null ? String(o.shippingAddress1) : undefined,
    shippingAddress2: o.shippingAddress2 != null ? String(o.shippingAddress2) : undefined,
    shippingPincode: o.shippingPincode != null ? String(o.shippingPincode) : undefined,
    shippingCity: o.shippingCity != null ? String(o.shippingCity) : undefined,
    shippingState: o.shippingState != null ? String(o.shippingState) : undefined,
    velocityWarehouseId: o.velocityWarehouseId != null ? String(o.velocityWarehouseId) : undefined,
    velocityOrderId: o.velocityOrderId != null ? String(o.velocityOrderId) : undefined,
    velocityShipmentId: o.velocityShipmentId != null ? String(o.velocityShipmentId) : undefined,
    createdAt: toIsoDateString(o.createdAt),
    assignedDateTime: toIsoDateString(o.assignedDateTime),
    courierCompanyId:
      o.courierCompanyId !== undefined && o.courierCompanyId !== null
        ? typeof o.courierCompanyId === "number"
          ? o.courierCompanyId
          : String(o.courierCompanyId)
        : undefined,
    courierName: o.courierName != null ? String(o.courierName) : undefined,
    labelUrl: o.labelUrl != null ? String(o.labelUrl) : undefined,
    manifestUrl: o.manifestUrl != null ? String(o.manifestUrl) : undefined,
    shippingCharges:
      o.shippingCharges !== undefined && o.shippingCharges !== null ? Number(o.shippingCharges) : undefined,
    codCharges: o.codCharges !== undefined && o.codCharges !== null ? Number(o.codCharges) : undefined,
    rtoCharges: o.rtoCharges !== undefined && o.rtoCharges !== null ? Number(o.rtoCharges) : undefined,
    trackingUrl: o.trackingUrl != null ? String(o.trackingUrl) : undefined,
    trackingActivities: (o.trackingActivities as Order["trackingActivities"]) || undefined,
    pickupDate: toIsoDateString(o.pickupDate),
    edd: toIsoDateString(o.edd),
    statusHistory: (o.statusHistory as Order["statusHistory"]) || undefined,
    sourceType: o.sourceType != null ? String(o.sourceType) : undefined,
    shopifyOrderNumericId: o.shopifyOrderNumericId != null ? String(o.shopifyOrderNumericId) : undefined,
    shopifyShopDomain: o.shopifyShopDomain != null ? String(o.shopifyShopDomain) : undefined,
    shopifyStoreName: o.shopifyStoreName != null ? String(o.shopifyStoreName) : undefined,
    shopifyFinancialStatus: o.shopifyFinancialStatus != null ? String(o.shopifyFinancialStatus) : undefined,
    shopifyFulfillmentStatus: o.shopifyFulfillmentStatus != null ? String(o.shopifyFulfillmentStatus) : undefined,
    shopifyNote: o.shopifyNote != null ? String(o.shopifyNote) : undefined,
    shopifyTags: o.shopifyTags != null ? String(o.shopifyTags) : undefined,
    adminRemark: o.adminRemark != null ? String(o.adminRemark) : undefined,
    lastShopifySyncAt: toIsoDateString(o.lastShopifySyncAt),
    shopifyLineItems: Array.isArray(o.shopifyLineItems)
      ? (o.shopifyLineItems as Order["shopifyLineItems"])
      : undefined,
    items: (o.items as Order["products"]) || (o.orderItems as Order["products"]) || undefined,
    updatedAt: toIsoDateString(o.updatedAt),
  };
}

export function useOrders(view?: "junk") {
  const queryFn = useCallback(async () => {
    const rows = await orderService.listOrders({ view, legacy: true });
    return (rows as unknown as Record<string, unknown>[]).map(mapOrderRow);
  }, [view]);
  return useApiQuery<Order>(`orders:${view ?? "default"}`, queryFn);
}

export interface UseOrdersQueryOptions extends OrderListFilterValues {
  view?: "junk";
  page?: number;
  pageSize?: number;
  q?: string;
  tab?: string;
  payment?: string;
  fulfillment?: string;
  counts?: boolean;
}

function stableAdvKey(f: OrderListFilterValues): string {
  const entries = Object.entries(f).filter(([, v]) => v != null && String(v).trim() !== "");
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${String(v)}`).join("&");
}

export interface OrdersQueryState {
  data: Order[];
  total: number;
  page: number;
  pageSize: number;
  tabCounts?: Record<string, number>;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: (opts?: { includeCounts?: boolean }) => Promise<Order[]>;
}

/** Paginated orders + server filters (preferred for order list pages). */
export function useOrdersQuery(opts: UseOrdersQueryOptions): OrdersQueryState {
  const {
    view,
    page = 1,
    pageSize = 50,
    q,
    tab,
    payment,
    fulfillment,
    counts = true,
    status,
    courier,
    source,
    dateFrom,
    dateTo,
    customerCity,
    customerState,
    pickupCity,
    pickupState,
    productSku,
    productName,
    amountMin,
    amountMax,
    hasAwb,
    shipmentCreated,
    dropshipperId,
    vendorId,
  } = opts;

  const adv: OrderListFilterValues = {
    status,
    courier,
    source,
    dateFrom,
    dateTo,
    customerCity,
    customerState,
    pickupCity,
    pickupState,
    productSku,
    productName,
    amountMin,
    amountMax,
    hasAwb,
    shipmentCreated,
    dropshipperId,
    vendorId,
  };

  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<Record<string, number> | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const dataRef = useRef<Order[]>([]);
  const includeCountsRef = useRef(counts);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const advKey = stableAdvKey(adv);
  const key = `orders:v2:${view ?? "default"}:${page}:${pageSize}:${q ?? ""}:${tab ?? ""}:${payment ?? ""}:${fulfillment ?? ""}:${counts ? 1 : 0}:${advKey}`;

  const load = useCallback(async (override?: { includeCounts?: boolean }): Promise<Order[]> => {
    const wantCounts = override?.includeCounts ?? includeCountsRef.current;
    const hasData = dataRef.current.length > 0;
    if (!hasData) setIsLoading(true);
    setIsFetching(true);
    try {
      const res = await orderService.listOrders({
        view,
        page,
        pageSize,
        q,
        tab: view === "junk" ? undefined : tab,
        payment,
        fulfillment,
        counts: wantCounts,
        ...adv,
      });
      if (Array.isArray(res)) {
        const mapped = (res as unknown as Record<string, unknown>[]).map(mapOrderRow);
        setData(mapped);
        setTotal(mapped.length);
        if (wantCounts) setTabCounts(undefined);
        setError(null);
        return mapped;
      }
      const meta = res as OrdersListMeta;
      const mapped = (meta.orders as unknown as Record<string, unknown>[]).map(mapOrderRow);
      setData(mapped);
      setTotal(meta.total);
      if (wantCounts && meta.tabCounts) {
        setTabCounts(meta.tabCounts);
      }
      setError(null);
      return mapped;
    } catch (err) {
      const e = toError(err);
      setError(e);
      if (!hasData) {
        setData([]);
        setTotal(0);
        if (wantCounts) setTabCounts(undefined);
      }
      return [];
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [
    view,
    page,
    pageSize,
    q,
    tab,
    payment,
    fulfillment,
    counts,
    status,
    courier,
    source,
    dateFrom,
    dateTo,
    customerCity,
    customerState,
    pickupCity,
    pickupState,
    productSku,
    productName,
    amountMin,
    amountMax,
    hasAwb,
    shipmentCreated,
    dropshipperId,
    vendorId,
  ]);

  useEffect(() => {
    includeCountsRef.current = counts;
  }, [counts]);

  useEffect(() => {
    const eventName = `shipamaze:refetch:${key}`;
    const fallbackOrdersEvent = "shipamaze:refetch:orders";
    const handler = () => {
      void load();
    };
    window.addEventListener(eventName, handler);
    window.addEventListener(fallbackOrdersEvent, handler);
    return () => {
      window.removeEventListener(eventName, handler);
      window.removeEventListener(fallbackOrdersEvent, handler);
    };
  }, [key, load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFETCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return useMemo(
    () => ({
      data,
      total,
      page,
      pageSize,
      tabCounts,
      error,
      isLoading,
      isFetching,
      refetch: (opts?: { includeCounts?: boolean }) => load(opts),
    }),
    [data, total, page, pageSize, tabCounts, error, isLoading, isFetching, load]
  );
}

export function useManifests() {
  const queryFn = useCallback(async () => {
    const rows = (await manifestService.listManifests()) as unknown as Record<string, unknown>[];
    return rows.map((m) => ({
      id: String(m.id ?? ""),
      date: String(m.date ?? ""),
      courier: (m.courier as Manifest["courier"]) || "Delhivery",
      ordersCount: Number(m.ordersCount ?? 0),
      totalWeight: String(m.totalWeight ?? ""),
      pickupAddress: String(m.pickupAddress ?? ""),
      status: (m.status as Manifest["status"]) || "Generated",
      pickupTime: m.pickupTime as string | undefined,
    }));
  }, []);
  return useApiQuery<Manifest>("manifests", queryFn);
}

export function useInvoices() {
  const queryFn = useCallback(async () => {
    const r = await invoiceService.listInvoices({ page: "1", pageSize: "200" });
    return r.items;
  }, []);
  return useApiQuery<Invoice>("invoices", queryFn);
}

export function useWeightDisputes() {
  const queryFn = useCallback(async () => weightDisputeService.listWeightDisputes(), []);
  return useApiQuery<WeightDispute>("weight_disputes", queryFn);
}

export function useTransactions() {
  const queryFn = useCallback(async () => {
    const r = await walletService.listTransactions({ page: 1, pageSize: 100 });
    return r.items;
  }, []);
  return useApiQuery<Transaction>("transactions", queryFn);
}

/** Wallet summary for topbar and wallet page (refetch via `shipamaze:refetch:wallet`). */
export function useWalletSummary() {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const s = await walletService.getWalletSummary();
      setData(s);
      setError(null);
    } catch (err) {
      setError(toError(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ev = () => void load();
    window.addEventListener("shipamaze:refetch:wallet", ev);
    return () => window.removeEventListener("shipamaze:refetch:wallet", ev);
  }, [load]);

  return { data, error, isLoading, refetch: load };
}

export type NdrRow = {
  awb: string;
  customer: string;
  seller: string;
  reason: string;
  attempts: number;
  lastUpdate: string;
  status: string;
  phone: string;
  nextAction: string;
  orderId?: string;
  carrier?: string;
  velocityStatus?: string;
  amount?: number;
  actionStatus?: string;
  actionMessage?: string;
  lastActionAt?: string;
};

export function useNdrOrders() {
  const queryFn = useCallback(async () => {
    const rows = (await ndrService.listNdr()) as unknown as Record<string, unknown>[];
    return rows.map((n) => ({
      awb: String(n.awb ?? ""),
      customer: String(n.customer ?? ""),
      seller: String(n.seller ?? ""),
      reason: String(n.reason ?? ""),
      attempts: Number(n.attempts ?? 1),
      lastUpdate: String(n.lastUpdate ?? ""),
      status: String(n.status ?? "Active"),
      phone: String(n.phone ?? ""),
      nextAction: String(n.nextAction ?? ""),
      orderId: String(n.orderId ?? ""),
      carrier: String(n.carrier ?? ""),
      velocityStatus: String(n.velocityStatus ?? ""),
      amount: n.amount != null ? Number(n.amount) : undefined,
      actionStatus: String(n.actionStatus ?? ""),
      actionMessage: String(n.actionMessage ?? ""),
      lastActionAt: String(n.lastActionAt ?? ""),
    }));
  }, []);
  return useApiQuery<NdrRow>("ndr_orders", queryFn);
}

export function useReturnOrders() {
  const queryFn = useCallback(async () => {
    const rows = (await returnService.listReturns()) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      originalOrderId: String(r.originalOrderId ?? ""),
      awb: String(r.awb ?? ""),
      customer: String(r.customer ?? ""),
      reason: String(r.reason ?? ""),
      courier: (r.courier as ReturnOrder["courier"]) || "Delhivery",
      status: (r.status as ReturnOrder["status"]) || "Return Requested",
      date: String(r.date ?? ""),
      refundAmount: Number(r.refundAmount ?? 0),
      weight: String(r.weight ?? ""),
    }));
  }, []);
  return useApiQuery<ReturnOrder>("return_orders", queryFn);
}

export type CatalogueProductRow = {
  id: string;
  name: string;
  sku: string;
  vendorSku: string;
  category: string;
  weight: string;
  price: number;
  sellingPrice: number;
  shippingCharge: number;
  ourCommission: number;
  stock: number;
  hsn: string;
  dimensions: string;
};

export function useProducts() {
  const queryFn = useCallback(async () => {
    const rows = (await productService.listProducts()) as unknown as Record<string, unknown>[];
    return rows.map((p) => ({
      id: String(p._id ?? p.id ?? ""),
      name: String(p.name ?? ""),
      sku: String(p.sku ?? ""),
      vendorSku: String(p.vendorSku ?? p.vendor_sku ?? ""),
      category: String(p.category ?? ""),
      weight: String(p.weight ?? ""),
      price: Number(p.price ?? 0),
      sellingPrice: Number(p.sellingPrice ?? p.selling_price ?? 0),
      shippingCharge: Number(p.shippingCharge ?? p.shipping_charge ?? p.shippingCharges ?? 0),
      ourCommission: Number(p.ourCommission ?? p.our_commission ?? p.commission ?? 40),
      stock: Number(p.stock ?? 0),
      hsn: String(p.hsn ?? ""),
      dimensions: String(p.dimensions ?? ""),
    }));
  }, []);
  return useApiQuery<CatalogueProductRow>("products", queryFn);
}

export type CourierRow = {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  deliveryRate: number;
  ndrRate: number;
  rtoRate: number;
  avgDeliveryDays: number;
  codSupport: boolean;
  reversePickup: boolean;
  surfaceRate: number;
  airRate: number;
  preferredPickupAddressId: string;
  carrierId: string;
};

export function useCouriers() {
  const queryFn = useCallback(async () => {
    const rows = (await courierService.listCouriers()) as unknown as Record<string, unknown>[];
    return rows.map((c) => ({
      id: String(c._id ?? c.id ?? ""),
      name: String(c.name ?? ""),
      active: Boolean(c.active ?? true),
      priority: Number(c.priority ?? 0),
      deliveryRate: Number(c.deliveryRate ?? 0),
      ndrRate: Number(c.ndrRate ?? 0),
      rtoRate: Number(c.rtoRate ?? 0),
      avgDeliveryDays: Number(c.avgDeliveryDays ?? 3),
      codSupport: Boolean(c.codSupport ?? true),
      reversePickup: Boolean(c.reversePickup ?? false),
      surfaceRate: Number(c.surfaceRate ?? 0),
      airRate: Number(c.airRate ?? 0),
      preferredPickupAddressId: String(c.preferredPickupAddressId ?? ""),
      carrierId: String(c.carrierId ?? ""),
    }));
  }, []);
  return useApiQuery<CourierRow>("couriers", queryFn);
}

export function useCodRemittances() {
  const queryFn = useCallback(async () => {
    const r = await walletService.listCodRemittances({ page: "1", pageSize: "200" });
    return r.items;
  }, []);
  return useApiQuery<CODRemittance>("cod_remittances", queryFn);
}

export function usePickupAddresses(opts?: { scope?: "platform" }) {
  const scope = opts?.scope;
  const cacheKey = scope === "platform" ? "pickup_addresses_platform" : "pickup_addresses";
  const queryFn = useCallback(async () => pickupService.listPickupAddresses(scope), [scope]);
  return useApiQuery<PickupAddress>(cacheKey, queryFn);
}

export function usePincodes() {
  const queryFn = useCallback(async () => pincodeService.listPincodes(), []);
  return useApiQuery<PincodeService>("pincodes", queryFn);
}
