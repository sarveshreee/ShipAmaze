import { useCallback, useEffect, useMemo, useState } from "react";
import * as orderService from "@/services/orderService";
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
    const handler = () => {
      void load();
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
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
    pincode: String(o.pincode ?? ""),
    weight: String(o.weight ?? ""),
    courier: (o.courier as Order["courier"]) || "Delhivery",
    payment: (o.payment as Order["payment"]) || "Prepaid",
    status: (o.status as Order["status"]) || "pending",
    date: String(o.date ?? ""),
    awb: String(o.awb ?? ""),
    amount: Number(o.amount ?? 0),
    products: (o.products as Order["products"]) || [],
    dimensions: o.dimensions as string | undefined,
    zone: o.zone as string | undefined,
    pickupAddress: o.pickupAddress as string | undefined,
    channel: o.channel as string | undefined,
    externalSource: o.externalSource as string | undefined,
    externalOrderName: o.externalOrderName as string | undefined,
    shipmentCreated: Boolean(o.shipmentCreated),
    shipmentId: o.shipmentId as string | undefined,
    trackingId: o.trackingId as string | undefined,
    isJunk: Boolean(o.isJunk),
    junkedAt: o.junkedAt as string | undefined,
    junkReason: o.junkReason as string | undefined,
  };
}

export function useOrders(view?: "junk") {
  const queryFn = useCallback(async () => {
    const rows = await orderService.listOrders(view);
    return (rows as unknown as Record<string, unknown>[]).map(mapOrderRow);
  }, [view]);
  return useApiQuery<Order>(`orders:${view ?? "default"}`, queryFn);
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
  const queryFn = useCallback(async () => invoiceService.listInvoices(), []);
  return useApiQuery<Invoice>("invoices", queryFn);
}

export function useWeightDisputes() {
  const queryFn = useCallback(async () => weightDisputeService.listWeightDisputes(), []);
  return useApiQuery<WeightDispute>("weight_disputes", queryFn);
}

export function useTransactions() {
  const queryFn = useCallback(async () => walletService.listTransactions(), []);
  return useApiQuery<Transaction>("transactions", queryFn);
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
  category: string;
  weight: string;
  price: number;
  sellingPrice: number;
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
      category: String(p.category ?? ""),
      weight: String(p.weight ?? ""),
      price: Number(p.price ?? 0),
      sellingPrice: Number(p.sellingPrice ?? p.selling_price ?? 0),
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
    }));
  }, []);
  return useApiQuery<CourierRow>("couriers", queryFn);
}

export function useCodRemittances() {
  const queryFn = useCallback(async () => walletService.listCodRemittances(), []);
  return useApiQuery<CODRemittance>("cod_remittances", queryFn);
}

export function usePickupAddresses() {
  const queryFn = useCallback(async () => pickupService.listPickups(), []);
  return useApiQuery<PickupAddress>("pickup_addresses", queryFn);
}

export function usePincodes() {
  const queryFn = useCallback(async () => pincodeService.listPincodes(), []);
  return useApiQuery<PincodeService>("pincodes", queryFn);
}
