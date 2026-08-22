import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
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
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryClient";

type QueryStatus = "pending" | "success" | "error";

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

/** Bridge custom window events → React Query invalidation (preserves existing callers). */
function useInvalidateOnEvents(queryKey: QueryKey, eventNames: string[]) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = () => {
      void qc.invalidateQueries({ queryKey });
    };
    for (const name of eventNames) window.addEventListener(name, handler);
    return () => {
      for (const name of eventNames) window.removeEventListener(name, handler);
    };
  }, [qc, queryKey, eventNames]);
}

function useApiQuery<T>(
  key: string,
  queryKey: QueryKey,
  queryFn: (signal: AbortSignal) => Promise<T[]>,
  opts?: { enabled?: boolean; staleTime?: number }
): SimpleQueryResult<T> {
  const eventNames = useMemo(() => {
    const names = [`shipamaze:refetch:${key}`];
    if (key.startsWith("orders:")) names.push("shipamaze:refetch:orders");
    return names;
  }, [key]);

  useInvalidateOnEvents(queryKey, eventNames);

  const q = useQuery({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    enabled: opts?.enabled ?? true,
    staleTime: opts?.staleTime,
  });

  const refetch = useCallback(async () => {
    await q.refetch();
  }, [q]);

  return useMemo(
    () => ({
      data: q.data ?? [],
      error: q.error ? toError(q.error) : null,
      isLoading: q.isLoading,
      isPending: q.isPending || q.isLoading,
      isError: q.isError,
      isSuccess: q.isSuccess,
      status: q.isPending || q.isLoading ? "pending" : q.isError ? "error" : "success",
      refetch,
    }),
    [q.data, q.error, q.isLoading, q.isPending, q.isError, q.isSuccess, refetch]
  );
}

function mapOrderRow(o: Record<string, unknown>): Order {
  return {
    id: String(o.id ?? o.orderId ?? ""),
    orderId: o.orderId != null ? String(o.orderId) : undefined,
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
    orderItems: (o.orderItems as Order["orderItems"]) || undefined,
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
    courierProvider: o.courierProvider != null ? String(o.courierProvider) : undefined,
    updatedAt: toIsoDateString(o.updatedAt),
  };
}

/** @deprecated Prefer useOrdersQuery. Only fetch when explicitly needed (e.g. search UI). */
export function useOrders(view?: "junk", opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const queryFn = useCallback(
    async (_signal: AbortSignal) => {
      const rows = await orderService.listOrders({ view, legacy: true });
      return (rows as unknown as Record<string, unknown>[]).map(mapOrderRow);
    },
    [view]
  );
  return useApiQuery<Order>(
    `orders:${view ?? "default"}`,
    queryKeys.orders(userId, view),
    queryFn,
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
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
  enabled?: boolean;
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
  const { userId } = useAuth();
  const {
    view,
    page = 1,
    pageSize = 50,
    q,
    tab,
    payment,
    fulfillment,
    counts = true,
    enabled = true,
    status,
    courier,
    source,
    dateFrom,
    dateTo,
    dateType,
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
    dateType,
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

  const advKey = stableAdvKey(adv);
  const listKey = `${view ?? "default"}:${page}:${pageSize}:${q ?? ""}:${tab ?? ""}:${payment ?? ""}:${fulfillment ?? ""}:${counts ? 1 : 0}:${advKey}`;
  const queryKey = queryKeys.ordersList(userId, listKey);
  const qc = useQueryClient();

  useEffect(() => {
    const handler = () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
    };
    window.addEventListener(`shipamaze:refetch:orders:v2:${listKey}`, handler);
    window.addEventListener("shipamaze:refetch:orders", handler);
    return () => {
      window.removeEventListener(`shipamaze:refetch:orders:v2:${listKey}`, handler);
      window.removeEventListener("shipamaze:refetch:orders", handler);
    };
  }, [qc, listKey]);

  const qResult = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      const res = await orderService.listOrders({
        view,
        page,
        pageSize,
        q,
        tab: view === "junk" ? undefined : tab,
        payment,
        fulfillment,
        counts,
        ...adv,
      });
      if (Array.isArray(res)) {
        const mapped = (res as unknown as Record<string, unknown>[]).map(mapOrderRow);
        return { orders: mapped, total: mapped.length, tabCounts: undefined as Record<string, number> | undefined };
      }
      const meta = res as OrdersListMeta;
      const mapped = (meta.orders as unknown as Record<string, unknown>[]).map(mapOrderRow);
      return {
        orders: mapped,
        total: meta.total,
        tabCounts: counts ? meta.tabCounts : undefined,
      };
    },
  });

  const refetch = useCallback(
    async (override?: { includeCounts?: boolean }): Promise<Order[]> => {
      if (override?.includeCounts != null && override.includeCounts !== counts) {
        const res = await orderService.listOrders({
          view,
          page,
          pageSize,
          q,
          tab: view === "junk" ? undefined : tab,
          payment,
          fulfillment,
          counts: override.includeCounts,
          ...adv,
        });
        if (Array.isArray(res)) {
          const mapped = (res as unknown as Record<string, unknown>[]).map(mapOrderRow);
          qc.setQueryData(queryKey, { orders: mapped, total: mapped.length, tabCounts: undefined });
          return mapped;
        }
        const meta = res as OrdersListMeta;
        const mapped = (meta.orders as unknown as Record<string, unknown>[]).map(mapOrderRow);
        qc.setQueryData(queryKey, {
          orders: mapped,
          total: meta.total,
          tabCounts: override.includeCounts ? meta.tabCounts : qResult.data?.tabCounts,
        });
        return mapped;
      }
      const result = await qResult.refetch();
      return result.data?.orders ?? [];
    },
    [adv, counts, page, pageSize, q, qResult, qc, queryKey, tab, fulfillment, payment, view]
  );

  return useMemo(
    () => ({
      data: qResult.data?.orders ?? [],
      total: qResult.data?.total ?? 0,
      page,
      pageSize,
      tabCounts: qResult.data?.tabCounts,
      error: qResult.error ? toError(qResult.error) : null,
      isLoading: qResult.isLoading,
      isFetching: qResult.isFetching,
      refetch,
    }),
    [qResult.data, qResult.error, qResult.isLoading, qResult.isFetching, page, pageSize, refetch]
  );
}

export function useManifests() {
  const { userId } = useAuth();
  return useApiQuery<Manifest>(
    "manifests",
    queryKeys.manifests(userId),
    async () => {
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
    },
    { staleTime: 2 * 60 * 1000 }
  );
}

export function useInvoices() {
  const { userId } = useAuth();
  return useApiQuery<Invoice>(
    "invoices",
    queryKeys.invoices(userId),
    async () => {
      const r = await invoiceService.listInvoices({ page: "1", pageSize: "200" });
      return r.items;
    },
    { staleTime: 2 * 60 * 1000 }
  );
}

export function useWeightDisputes() {
  const { userId } = useAuth();
  return useApiQuery<WeightDispute>(
    "weight_disputes",
    queryKeys.weightDisputes(userId),
    async () => weightDisputeService.listWeightDisputes(),
    { staleTime: 2 * 60 * 1000 }
  );
}

export function useTransactions() {
  const { userId } = useAuth();
  return useApiQuery<Transaction>(
    "transactions",
    queryKeys.transactions(userId),
    async () => {
      const r = await walletService.listTransactions({ page: 1, pageSize: 100 });
      return r.items;
    },
    { staleTime: 60 * 1000 }
  );
}

/** Wallet summary for topbar and wallet page (refetch via `shipamaze:refetch:wallet`). */
export function useWalletSummary(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const walletKey = queryKeys.wallet(userId);
  useEffect(() => {
    const ev = () => void qc.invalidateQueries({ queryKey: walletKey });
    window.addEventListener("shipamaze:refetch:wallet", ev);
    return () => window.removeEventListener("shipamaze:refetch:wallet", ev);
  }, [qc, walletKey]);

  const q = useQuery({
    queryKey: walletKey,
    queryFn: () => walletService.getWalletSummary(),
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });

  return {
    data: (q.data as WalletSummary | undefined) ?? null,
    error: q.error ? toError(q.error) : null,
    isLoading: q.isLoading,
    refetch: async () => {
      await q.refetch();
    },
  };
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
  courierProvider?: "velocity" | "lorrigo";
  providerStatus?: string;
  customerRemarks?: string;
  actionRequired?: boolean;
  recommendedAction?: string;
  supportedActions?: Array<"reattempt" | "return" | "fake-attempt">;
  amount?: number;
  actionStatus?: string;
  actionMessage?: string;
  lastActionAt?: string;
};

export function useNdrOrders(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  return useApiQuery<NdrRow>(
    "ndr_orders",
    queryKeys.ndr(userId),
    async () => {
      const rows = (await ndrService.listNdr()) as unknown as Record<string, unknown>[];
      return rows.map((n) => {
        const provider = n.courierProvider === "lorrigo" ? "lorrigo" : "velocity";
        const supportedRaw = Array.isArray(n.supportedActions) ? n.supportedActions : [];
        const supportedActions = supportedRaw
          .map((a) => String(a))
          .filter((a): a is "reattempt" | "return" | "fake-attempt" =>
            a === "reattempt" || a === "return" || a === "fake-attempt"
          );
        return {
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
          courierProvider: provider as "velocity" | "lorrigo",
          providerStatus: String(n.providerStatus ?? ""),
          customerRemarks: String(n.customerRemarks ?? ""),
          actionRequired: n.actionRequired !== false,
          recommendedAction: String(n.recommendedAction ?? ""),
          supportedActions:
            supportedActions.length > 0
              ? supportedActions
              : provider === "lorrigo"
                ? (["reattempt", "return", "fake-attempt"] as Array<"reattempt" | "return" | "fake-attempt">)
                : (["reattempt", "return"] as Array<"reattempt" | "return" | "fake-attempt">),
          amount: n.amount != null ? Number(n.amount) : undefined,
          actionStatus: String(n.actionStatus ?? ""),
          actionMessage: String(n.actionMessage ?? ""),
          lastActionAt: String(n.lastActionAt ?? ""),
        };
      });
    },
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
}

export function useReturnOrders(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  return useApiQuery<ReturnOrder>(
    "return_orders",
    queryKeys.returns(userId),
    async () => {
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
    },
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
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

export function useProducts(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  return useApiQuery<CatalogueProductRow>(
    "products",
    queryKeys.products(userId),
    async () => {
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
    },
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
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

export function useCouriers(opts?: { enabled?: boolean }) {
  return useApiQuery<CourierRow>(
    "couriers",
    queryKeys.couriers,
    async () => {
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
    },
    { enabled: opts?.enabled ?? true, staleTime: 10 * 60 * 1000 }
  );
}

export function useCodRemittances(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  return useApiQuery<CODRemittance>(
    "cod_remittances",
    queryKeys.codRemittances(userId),
    async () => {
      const r = await walletService.listCodRemittances({ page: "1", pageSize: "200" });
      return r.items;
    },
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
}

export function useGstRecords(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  return useApiQuery<walletService.GstRecord>(
    "gst_records",
    queryKeys.gstRecords(userId),
    async () => {
      const r = await walletService.listGstRecords({ limit: "500" });
      return r.items;
    },
    { enabled: opts?.enabled ?? true, staleTime: 2 * 60 * 1000 }
  );
}

export function usePickupAddresses(opts?: { scope?: "platform"; ownership?: "own"; enabled?: boolean }) {
  const { userId } = useAuth();
  const scope = opts?.scope;
  const ownership = opts?.ownership;
  const cacheScope = scope === "platform" ? "platform" : ownership === "own" ? "own" : "default";
  const cacheKey =
    cacheScope === "platform"
      ? "pickup_addresses_platform"
      : cacheScope === "own"
        ? "pickup_addresses_own"
        : "pickup_addresses";
  return useApiQuery<PickupAddress>(
    cacheKey,
    queryKeys.pickups(userId, cacheScope),
    async () => pickupService.listPickupAddresses(scope, ownership),
    { enabled: opts?.enabled ?? true, staleTime: 5 * 60 * 1000 }
  );
}

export function usePincodes(opts?: { enabled?: boolean }) {
  return useApiQuery<PincodeService>(
    "pincodes",
    queryKeys.pincodes,
    async () => pincodeService.listPincodes(),
    { enabled: opts?.enabled ?? true, staleTime: 30 * 60 * 1000 }
  );
}

/** Shared dashboard summary — one request, cached across dashboard/analytics. */
export function useDashboardSummary<T = Record<string, unknown>>(opts?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const dashboardKey = queryKeys.dashboard(userId);
  useEffect(() => {
    const ev = () => void qc.invalidateQueries({ queryKey: dashboardKey });
    window.addEventListener("shipamaze:refetch:dashboard", ev);
    return () => window.removeEventListener("shipamaze:refetch:dashboard", ev);
  }, [qc, dashboardKey]);

  const q = useQuery({
    queryKey: dashboardKey,
    queryFn: async ({ signal }) => {
      const { apiRequest } = await import("@/lib/apiClient");
      return apiRequest<T>("/dashboard/summary", { method: "GET", signal });
    },
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });

  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error: q.error ? toError(q.error).message : null,
    reload: () => {
      void q.refetch();
    },
    refetch: q.refetch,
  };
}
