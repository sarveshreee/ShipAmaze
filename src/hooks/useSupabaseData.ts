import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  manifests as mockManifests,
  invoices as mockInvoices,
  weightDisputes as mockWeightDisputes,
  transactions as mockTransactions,
  ndrOrders as mockNdrOrders,
  returnOrders as mockReturnOrders,
  products as mockProducts,
  courierList as mockCouriers,
  pickupAddresses as mockPickupAddresses,
  codRemittances as mockCodRemittances,
  type Order,
} from "@/data/mockData";
import { useOrdersStore } from "@/stores/ordersStore";

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

function mapOrderRecord(o: any): Order {
  return {
    id: o.order_id,
    customer: o.customer,
    phone: o.phone || "",
    address: o.address || "",
    city: o.city || "",
    pincode: o.pincode || "",
    weight: o.weight || "",
    courier: (o.courier as any) || "Delhivery",
    payment: (o.payment as any) || "Prepaid",
    status: (o.status as any) || "pending",
    date: o.date || "",
    awb: o.awb || "",
    amount: Number(o.amount),
    products: (o.products as any[]) || [],
    dimensions: o.dimensions || "",
    zone: o.zone || "",
    pickupAddress: o.pickup_address || "",
  };
}

function useDemoOrQuery<T>(
  key: string,
  mockData: T[],
  queryFn: () => Promise<T[]>,
  isDemoMode: boolean
): SimpleQueryResult<T> {
  const [data, setData] = useState<T[]>(mockData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = isDemoMode ? mockData : await queryFn();
      const nextData = !isDemoMode && result.length === 0 ? mockData : result;
      setData(nextData);
      setError(null);
    } catch (err) {
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode, mockData, queryFn]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      try {
        const result = isDemoMode ? mockData : await queryFn();
        if (!isMounted) return;
        const nextData = !isDemoMode && result.length === 0 ? mockData : result;
        setData(nextData);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(toError(err));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [key, isDemoMode, mockData, queryFn]);

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

export function useOrders() {
  const { isDemoMode } = useAuth();
  const storeOrders = useOrdersStore((state) => state.orders);
  const mergeOrders = useOrdersStore((state) => state.mergeOrders);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemoMode && storeOrders.length === 0);

  const load = useCallback(async () => {
    if (isDemoMode) {
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(storeOrders.length === 0);

    try {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;

      if (data?.length) {
        mergeOrders(data.map(mapOrderRecord));
      }

      setError(null);
    } catch (err) {
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode, mergeOrders, storeOrders.length]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({
      data: storeOrders,
      error,
      isLoading,
      isPending: isLoading,
      isError: !!error,
      isSuccess: !isLoading && !error,
      status: isLoading ? "pending" : error ? "error" : "success",
      refetch: load,
    }),
    [storeOrders, error, isLoading, load]
  );
}

export function useManifests() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("manifests", mockManifests, async () => {
    const { data, error } = await supabase.from("manifests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((m) => ({
      id: m.manifest_id,
      date: m.date || "",
      courier: (m.courier as any) || "Delhivery",
      ordersCount: m.orders_count || 0,
      totalWeight: m.total_weight || "",
      pickupAddress: m.pickup_address || "",
      status: (m.status as any) || "Generated",
      pickupTime: m.pickup_time || undefined,
    }));
  }, isDemoMode);
}

export function useInvoices() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("invoices", mockInvoices, async () => {
    const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((inv) => ({
      id: inv.invoice_id,
      date: inv.date || "",
      period: inv.period || "",
      orders: inv.orders_count || 0,
      shippingCharges: Number(inv.shipping_charges) || 0,
      codCharges: Number(inv.cod_charges) || 0,
      gst: Number(inv.gst) || 0,
      total: Number(inv.total) || 0,
      status: (inv.status as any) || "Unpaid",
    }));
  }, isDemoMode);
}

export function useWeightDisputes() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("weight_disputes", mockWeightDisputes, async () => {
    const { data, error } = await supabase.from("weight_disputes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((w) => ({
      id: w.dispute_id,
      orderId: w.order_id || "",
      awb: w.awb || "",
      courier: (w.courier as any) || "Delhivery",
      sellerWeight: w.seller_weight || "",
      courierWeight: w.courier_weight || "",
      diff: w.diff || "",
      chargedAmount: Number(w.charged_amount) || 0,
      expectedAmount: Number(w.expected_amount) || 0,
      status: (w.status as any) || "Open",
      date: w.date || "",
    }));
  }, isDemoMode);
}

export function useTransactions() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("transactions", mockTransactions, async () => {
    const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((t) => ({
      id: t.txn_id,
      date: t.date || "",
      description: t.description || "",
      txnId: t.txn_id,
      type: (t.type as any) || "Credit",
      amount: Number(t.amount),
      balance: Number(t.balance),
    }));
  }, isDemoMode);
}

export function useNdrOrders() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("ndr_orders", mockNdrOrders, async () => {
    const { data, error } = await supabase.from("ndr_orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((n) => ({
      awb: n.awb,
      customer: n.customer || "",
      seller: n.seller || "",
      reason: (n.reason as any) || "Not at Home",
      attempts: n.attempts || 1,
      lastUpdate: n.last_update || "",
      status: (n.status as any) || "Active",
      phone: n.phone || "",
      nextAction: (n.next_action as any) || "Re-attempt",
    }));
  }, isDemoMode);
}

export function useReturnOrders() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("return_orders", mockReturnOrders, async () => {
    const { data, error } = await supabase.from("return_orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.return_id,
      originalOrderId: r.original_order_id || "",
      awb: r.awb || "",
      customer: r.customer || "",
      reason: r.reason || "",
      courier: (r.courier as any) || "Delhivery",
      status: (r.status as any) || "Return Requested",
      date: r.date || "",
      refundAmount: Number(r.refund_amount) || 0,
      weight: r.weight || "",
    }));
  }, isDemoMode);
}

export function useProducts() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("products", mockProducts, async () => {
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku || "",
      category: p.category || "",
      weight: p.weight || "",
      price: Number(p.price) || 0,
      sellingPrice: Number(p.selling_price) || 0,
      stock: p.stock || 0,
      hsn: p.hsn || "",
      dimensions: p.dimensions || "",
    }));
  }, isDemoMode);
}

export function useCouriers() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("couriers", mockCouriers, async () => {
    const { data, error } = await supabase.from("couriers").select("*").order("priority", { ascending: true });
    if (error) throw error;
    return (data || []).map((c) => ({
      name: c.name,
      active: c.active,
      priority: c.priority,
      deliveryRate: Number(c.delivery_rate) || 0,
      ndrRate: Number(c.ndr_rate) || 0,
      rtoRate: Number(c.rto_rate) || 0,
      avgDeliveryDays: c.avg_delivery_days || 3,
      codSupport: c.cod_support ?? true,
      reversePickup: c.reverse_pickup ?? false,
      surfaceRate: Number(c.surface_rate) || 0,
      airRate: Number(c.air_rate) || 0,
    }));
  }, isDemoMode);
}

export function useCodRemittances() {
  return useDemoOrQuery("cod_remittances", mockCodRemittances, async () => mockCodRemittances, true);
}

export function usePickupAddresses() {
  const { isDemoMode } = useAuth();
  return useDemoOrQuery("pickup_addresses", mockPickupAddresses, async () => {
    const { data, error } = await supabase.from("pickup_addresses").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return mockPickupAddresses;
    return data.map((a) => ({
      id: a.id,
      label: a.label,
      contactName: a.contact_name || "",
      phone: a.phone || "",
      addressLine1: a.address_line1 || "",
      addressLine2: a.address_line2 || "",
      city: a.city || "",
      state: a.state || "",
      pincode: a.pincode || "",
      isDefault: a.is_default ?? false,
    }));
  }, isDemoMode);
}
