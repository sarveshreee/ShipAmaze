import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect, Suspense } from "react";
import { Package, MapPin, Truck, Phone, User, CreditCard, Calendar, Weight, Ruler, Printer, RefreshCw, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { printShippingLabel } from "@/components/ShippingLabel";
import { TimelineTracker } from "@/components/TimelineTracker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { orders as mockOrders } from "@/data/mockData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

const STATUS_FLOW = ["ready-to-ship", "not-picked", "in-transit", "out-for-delivery", "delivered", "rto"];

const NDR_REASONS = [
  "Customer not available",
  "Wrong address",
  "Customer refused",
  "Phone not reachable",
  "COD amount issue",
];

function getNextStatuses(current: string): { value: string; label: string }[] {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx === -1) {
    // For statuses not in flow, show all
    return STATUS_FLOW.map(s => ({ value: s, label: s.replace(/-/g, " ") }));
  }
  return STATUS_FLOW.slice(idx + 1).map(s => ({ value: s, label: s.replace(/-/g, " ") }));
}

function updateLocalStorageOrder(orderId: string, updates: Record<string, any>) {
  const stored = localStorage.getItem("shipflow_orders");
  if (!stored) return;
  const orders = JSON.parse(stored);
  const idx = orders.findIndex((o: any) => o.id === orderId);
  if (idx !== -1) {
    orders[idx] = { ...orders[idx], ...updates };
    localStorage.setItem("shipflow_orders", JSON.stringify(orders));
  }
}

function removeLocalStorageOrder(orderId: string) {
  const stored = localStorage.getItem("shipflow_orders");
  if (!stored) return;
  const orders = JSON.parse(stored).filter((o: any) => o.id !== orderId);
  localStorage.setItem("shipflow_orders", JSON.stringify(orders));
}

export default function PublicOrderDetail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("id");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [cancelOpen, setCancelOpen] = useState(false);
  const [ndrOpen, setNdrOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ndrReason, setNdrReason] = useState("");
  const [newStatus, setNewStatus] = useState("");

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }

    const fetchOrder = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();

      if (data) {
        setOrder({
          id: data.order_id, customer: data.customer, phone: data.phone || "N/A",
          address: data.address || "N/A", city: data.city || "N/A", pincode: data.pincode || "N/A",
          weight: data.weight || "N/A", courier: data.courier || "N/A", payment: data.payment,
          status: data.status, date: data.date || data.created_at?.split("T")[0],
          awb: data.awb || "N/A", amount: data.amount, dimensions: data.dimensions,
          zone: data.zone, products: data.products || [],
        });
      } else {
        const stored = localStorage.getItem("shipflow_orders");
        const localOrders: any[] = stored ? JSON.parse(stored) : [];
        const localMatch = localOrders.find((o: any) => o.id === orderId);
        if (localMatch) {
          setOrder(localMatch);
        } else {
          const mock = mockOrders.find((o) => o.id === orderId);
          if (mock) setOrder(mock);
        }
      }
      setLoading(false);
    };
    fetchOrder();
  }, [orderId]);

  const handleCancelOrder = () => {
    if (!orderId) return;
    removeLocalStorageOrder(orderId);
    setCancelOpen(false);
    toast.success("Order cancelled and removed.");
    navigate("/dropshipper/orders");
  };

  const handleRaiseNDR = () => {
    if (!orderId || !ndrReason) return;
    updateLocalStorageOrder(orderId, { status: "ndr" });
    setOrder((prev: any) => prev ? { ...prev, status: "ndr" } : prev);
    setNdrOpen(false);
    setNdrReason("");
    toast.success("NDR raised successfully.");
  };

  const handleUpdateStatus = () => {
    if (!orderId || !newStatus) return;
    updateLocalStorageOrder(orderId, { status: newStatus });
    setOrder((prev: any) => prev ? { ...prev, status: newStatus } : prev);
    setStatusOpen(false);
    setNewStatus("");
    toast.success(`Status updated to ${newStatus.replace(/-/g, " ")}.`);
  };

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

  const nextStatuses = getNextStatuses(order.status);

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

        {/* Quick Actions */}
        <div className="rounded-xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11 gap-2 text-sm font-medium" onClick={() => { printShippingLabel(order); toast.success("Printing label..."); }}>
              <Printer className="h-4 w-4" /> Print Label
            </Button>
            <Button variant="outline" className="h-11 gap-2 text-sm font-medium" onClick={() => { setNewStatus(""); setStatusOpen(true); }}>
              <RefreshCw className="h-4 w-4" /> Update Status
            </Button>
            <Button variant="outline" className="h-11 gap-2 text-sm font-medium text-warning-dark" onClick={() => { setNdrReason(""); setNdrOpen(true); }}>
              <AlertTriangle className="h-4 w-4" /> Raise NDR
            </Button>
            <Button variant="outline" className="h-11 gap-2 text-sm font-medium text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/10" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" /> Cancel Order
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <Suspense fallback={<div className="rounded-xl bg-card border border-border p-5 animate-pulse h-32" />}>
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
        </Suspense>
      </main>

      {/* Cancel Order Modal */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>No, Keep It</Button>
            <Button variant="destructive" onClick={handleCancelOrder}>Yes, Cancel Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise NDR Modal */}
      <Dialog open={ndrOpen} onOpenChange={setNdrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise NDR — Select Reason</DialogTitle>
          </DialogHeader>
          <RadioGroup value={ndrReason} onValueChange={setNdrReason} className="space-y-3">
            {NDR_REASONS.map(reason => (
              <div key={reason} className="flex items-center space-x-3">
                <RadioGroupItem value={reason} id={reason} />
                <Label htmlFor={reason} className="cursor-pointer">{reason}</Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNdrOpen(false)}>Cancel</Button>
            <Button onClick={handleRaiseNDR} disabled={!ndrReason}>Submit NDR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Modal */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Current status: <span className="font-medium capitalize">{order.status?.replace(/-/g, " ")}</span>
            </DialogDescription>
          </DialogHeader>
          {nextStatuses.length > 0 ? (
            <RadioGroup value={newStatus} onValueChange={setNewStatus} className="space-y-3">
              {nextStatuses.map(s => (
                <div key={s.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={s.value} id={s.value} />
                  <Label htmlFor={s.value} className="cursor-pointer capitalize">{s.label}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <p className="text-sm text-text-muted">No further status transitions available.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} disabled={!newStatus}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
