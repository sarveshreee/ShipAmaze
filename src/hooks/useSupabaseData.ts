import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Order = {
  id: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  weight: string;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: any[];
  dimensions: string;
  zone: string;
  pickupAddress: string;
};

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

function useQuery<T>(key: string, queryFn: () => Promise<T[]>): SimpleQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await queryFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [queryFn]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      setIsLoading(true);
      try {
        const result = await queryFn();
        if (!isMounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(toError(err));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void run();
    return () => { isMounted = false; };
  }, [key, queryFn]);

  return useMemo(
    () => ({
      data, error, isLoading,
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
  return useQuery("orders", async () => {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((o) => ({
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
    })) as Order[];
  });
}

export function useManifests() {
  return useQuery("manifests", async () => {
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
  });
}

export function useInvoices() {
  return useQuery("invoices", async () => {
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
  });
}

export function useWeightDisputes() {
  return useQuery("weight_disputes", async () => {
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
  });
}

export function useTransactions() {
  return useQuery("transactions", async () => {
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
  });
}

export function useNdrOrders() {
  return useQuery("ndr_orders", async () => {
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
  });
}

export function useReturnOrders() {
  return useQuery("return_orders", async () => {
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
  });
}

export function useProducts() {
  return useQuery("products", async () => {
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
  });
}

export function useCouriers() {
  return useQuery("couriers", async () => {
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
  });
}

export function useCodRemittances() {
  return useQuery("cod_remittances", async () => []);
}

export function usePickupAddresses() {
  return useQuery("pickup_addresses", async () => {
    const { data, error } = await supabase.from("pickup_addresses").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => ({
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
  });
}
