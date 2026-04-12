import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Package, MapPin, Truck, Phone, User, CreditCard, Calendar, Weight, Ruler } from "lucide-react";
import { TimelineTracker } from "@/components/TimelineTracker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { orders as mockOrders } from "@/data/mockData";

const statusColors: Record<string, string> = {
  delivered: "bg-success-light text-success-dark",
  "in-transit": "bg-primary-light text-primary-dark",
  "out-for-delivery": "bg-secondary-light text-secondary-dark",
  ndr: "bg-warning-light text-warning-dark",
  rto: "bg-danger-light text-danger-dark",
  pending: "bg-surface-2 text-text-muted",
  "ready-to-ship": "bg-accent text-accent-foreground",
  "not-picked": "bg-warning-light text-warning-dark",
  cancelled: "bg-surface-2 text-text-muted",
  draft: "bg-surface-2 text-text-muted",
};

export default function PublicOrderDetail() {
  const [params] = useSearchParams();
  const orderId = params.get("id");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }

    const fetchOrder = async () => {
      // Try Supabase first
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();

      if (data) {
        setOrder({
          id: data.order_id,
          customer: data.customer,
          phone: data.phone || "N/A",
          address: data.address || "N/A",
          city: data.city || "N/A",
          pincode: data.pincode || "N/A",
          weight: data.weight || "N/A",
          courier: data.courier || "N/A",
          payment: data.payment,
          status: data.status,
          date: data.date || data.created_at?.split("T")[0],
          awb: data.awb || "N/A",
          amount: data.amount,
          dimensions: data.dimensions,
          zone: data.zone,
          products: data.products || [],
        });
      } else {
        // Fallback to mock data
        const mock = mockOrders.find((o) => o.id === orderId);
        if (mock) setOrder(mock);
      }
      setLoading(false);
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Package className="h-12 w-12 text-text-muted mx-auto" />
          <p className="text-lg font-semibold text-text-primary">Order not found</p>
          <p className="text-sm text-text-muted">ID: {orderId || "none"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary">Order {order.id}</h1>
          <p className="text-xs text-text-muted">Shipment Details</p>
        </div>
        <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-semibold capitalize", statusColors[order.status] || "bg-surface-2 text-text-muted")}>
          {order.status?.replace(/-/g, " ")}
        </span>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Customer & Shipping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Customer Details
            </h2>
            <div className="space-y-2 text-sm">
              <p className="text-text-primary font-medium">{order.customer}</p>
              <p className="text-text-muted flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{order.phone}</p>
              <p className="text-text-muted flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{order.address}</p>
              <p className="text-text-muted">{order.city} — {order.pincode}</p>
            </div>
          </div>

          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Truck className="h-4 w-4 text-secondary" /> Shipping Info
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">AWB</span><span className="font-mono text-text-primary">{order.awb}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Courier</span><span className="text-text-primary">{order.courier}</span></div>
              <div className="flex justify-between"><span className="text-text-muted flex items-center gap-1"><Weight className="h-3.5 w-3.5" />Weight</span><span className="text-text-primary">{order.weight}</span></div>
              {order.dimensions && <div className="flex justify-between"><span className="text-text-muted flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />Dimensions</span><span className="text-text-primary">{order.dimensions}</span></div>}
              {order.zone && <div className="flex justify-between"><span className="text-text-muted">Zone</span><span className="text-text-primary">{order.zone}</span></div>}
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent-foreground" /> Payment
          </h2>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", order.payment === "COD" ? "bg-warning-light text-warning-dark" : "bg-success-light text-success-dark")}>{order.payment}</span>
              <span className="text-text-muted flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{order.date}</span>
            </div>
            <span className="text-xl font-bold text-text-primary">₹{Number(order.amount).toLocaleString()}</span>
          </div>
        </div>

        {/* Products */}
        {order.products && order.products.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Products
            </h2>
            <div className="divide-y divide-border">
              {(Array.isArray(order.products) ? order.products : []).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-text-primary font-medium">{p.name}</p>
                    <p className="text-xs text-text-muted">Qty: {p.qty} · {p.weight}</p>
                  </div>
                  <span className="font-medium text-text-primary">₹{Number(p.price).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-xl bg-card border border-border p-5">
          <TimelineTracker
            steps={[
              { label: "Order Placed", detail: order.date },
              { label: "Ready to Ship" },
              { label: "Picked Up" },
              { label: "In Transit" },
              { label: "Out for Delivery" },
              { label: "Delivered" },
            ]}
            currentStep={
              order.status === "delivered" ? 5
                : order.status === "out-for-delivery" ? 4
                : order.status === "in-transit" ? 3
                : order.status === "not-picked" ? 2
                : order.status === "ready-to-ship" ? 1
                : 0
            }
          />
        </div>
      </main>
    </div>
  );
}
