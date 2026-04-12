import { useParams } from "react-router-dom";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { TimelineTracker } from "@/components/TimelineTracker";
import { mockOrders, type Order } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import {
  User, Phone, MapPin, Package, Truck, Printer,
  Hash, Weight, IndianRupee, Calendar, Box, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { printShippingLabel } from "@/components/ShippingLabel";

const statusToStep: Record<string, number> = {
  draft: -1, pending: 0, "ready-to-ship": 0, "not-picked": 0,
  "on-process": 1, "in-transit": 2, "out-for-delivery": 3, delivered: 4,
  ndr: 3, rto: 2, cancelled: -1,
};

const timelineSteps = [
  { label: "Order Placed", detail: "Order confirmed & ready" },
  { label: "Picked Up", detail: "Picked from warehouse" },
  { label: "In Transit", detail: "Shipment on the way" },
  { label: "Out for Delivery", detail: "With delivery agent" },
  { label: "Delivered", detail: "Successfully delivered" },
];

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      // Try from Supabase first
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", orderId || "")
        .maybeSingle();

      if (data) {
        const products = Array.isArray(data.products)
          ? (data.products as any[]).map((p: any) => ({
              name: p.name || "Product",
              qty: p.qty || 1,
              price: p.price || 0,
              weight: p.weight || "0.5 kg",
            }))
          : [{ name: "Product", qty: 1, price: data.amount, weight: data.weight || "0.5 kg" }];

        setOrder({
          id: data.order_id,
          customer: data.customer,
          phone: data.phone || "",
          address: data.address || "",
          city: data.city || "",
          pincode: data.pincode || "",
          amount: data.amount,
          payment: data.payment as any,
          status: data.status as any,
          courier: data.courier || "Unassigned",
          awb: data.awb || "N/A",
          date: data.date || data.created_at?.split("T")[0] || "",
          weight: data.weight || "0.5 kg",
          dimensions: data.dimensions || "",
          zone: data.zone || "",
          products,
          pickupAddress: data.pickup_address || "",
        });
      } else {
        // Fallback to mock data
        const mock = mockOrders.find(o => o.id === orderId);
        setOrder(mock || null);
      }
      setLoading(false);
    }
    fetchOrder();
  }, [orderId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${text} copied to clipboard`);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-text-primary gap-3">
        <Package className="h-12 w-12 text-text-muted" />
        <h2 className="text-lg font-semibold">Order not found</h2>
        <p className="text-sm text-text-muted">Order ID "{orderId}" does not exist.</p>
      </div>
    );
  }

  const currentStep = statusToStep[order.status] ?? -1;
  const steps = timelineSteps.map((s, i) => ({
    ...s,
    timestamp: i <= currentStep ? `Apr ${1 + i * 2}, 2026 — ${9 + i * 2}:${15 + i * 10} AM` : "",
  }));

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-text-primary">Order {order.id}</h1>
            <p className="text-xs text-text-muted mt-0.5">{order.date}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Customer Info */}
        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            <User className="h-3.5 w-3.5" /> Customer Information
          </h4>
          <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-primary font-semibold text-sm">
                {order.customer.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{order.customer}</p>
                <p className="text-xs text-text-muted">{order.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-text-muted shrink-0" />
              <span>{order.address}, {order.city} — {order.pincode}</span>
            </div>
          </div>
        </section>

        {/* Shipment Details */}
        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            <Truck className="h-3.5 w-3.5" /> Shipment Details
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Hash, label: "AWB", value: order.awb, copyable: true },
              { icon: Truck, label: "Courier", value: order.courier },
              { icon: Weight, label: "Weight", value: order.weight },
              { icon: IndianRupee, label: "Amount", value: `₹${order.amount}` },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <item.icon className="h-3 w-3 text-text-muted" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{item.label}</span>
                  {item.copyable && (
                    <button onClick={() => copyToClipboard(item.value)} className="ml-auto text-text-muted hover:text-primary">
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm font-semibold text-text-primary font-mono">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <PaymentBadge type={order.payment} />
          </div>
        </section>

        {/* Products */}
        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            <Box className="h-3.5 w-3.5" /> Products
          </h4>
          <div className="rounded-xl border border-border overflow-hidden">
            {order.products.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border-b border-border last:border-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/50">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                  <p className="text-xs text-text-muted">Qty: {p.qty} · {p.weight}</p>
                </div>
                <p className="text-sm font-semibold text-text-primary">₹{p.price}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            <Calendar className="h-3.5 w-3.5" /> Shipment Timeline
          </h4>
          <div className="rounded-xl border border-border bg-card p-4">
            <TimelineTracker steps={steps} currentStep={currentStep} />
          </div>
        </section>

        {/* Print Label */}
        <div className="pb-6">
          <Button variant="outline" className="w-full gap-2" onClick={() => printShippingLabel(order)}>
            <Printer className="h-4 w-4" /> Print Shipping Label
          </Button>
        </div>
      </div>
    </div>
  );
}
