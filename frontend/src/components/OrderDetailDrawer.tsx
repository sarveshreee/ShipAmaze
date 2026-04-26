import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { TimelineTracker } from "@/components/TimelineTracker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Order, OrderStatus } from "@/types/logistics";
import {
  User, MapPin, Package, Truck, Printer, XCircle, AlertTriangle,
  Hash, Weight, IndianRupee, Calendar, Box, Copy, RefreshCw, Loader2,
  Zap, Download, ExternalLink, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import * as orderService from "@/services/orderService";
import * as velocityService from "@/services/velocityService";
import { printShippingLabel } from "@/components/ShippingLabel";

interface OrderDetailDrawerProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
}

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

const allStatuses: OrderStatus[] = ['pending', 'ready-to-ship', 'not-picked', 'in-transit', 'out-for-delivery', 'delivered', 'ndr', 'rto', 'cancelled'];

export function OrderDetailDrawer({ order, open, onClose, onOrderUpdated }: OrderDetailDrawerProps) {
  const [updating, setUpdating] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [liveActivities, setLiveActivities] = useState<Order["trackingActivities"]>(undefined);

  if (!order) return null;

  const currentStep = statusToStep[order.status] ?? -1;
  const steps = timelineSteps.map((s, i) => ({
    ...s,
    timestamp: i <= currentStep ? `Apr ${1 + i * 2}, 2026 — ${9 + i * 2}:${15 + i * 10} AM` : "",
  }));

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${text} copied to clipboard`);
  };

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      await orderService.updateOrderStatus(order.id, newStatus);
      toast.success(`Order ${order.id} status updated to ${newStatus}`);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUpdating(false);
    }
  };

  const cancelOrder = async () => {
    if (!confirm(`Cancel order ${order.id}?`)) return;

    // If Velocity AWB exists, cancel through provider
    const awbToCancel = order.awb || order.velocityShipmentId;
    if (awbToCancel) {
      setUpdating(true);
      try {
        await velocityService.cancelShipment({ awbs: [awbToCancel], orderId: order.id });
        toast.success(`Shipment ${awbToCancel} cancellation requested`);
        onOrderUpdated?.();
        return;
      } catch (err: unknown) {
        toast.error(`Cancel failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setUpdating(false);
      }
    } else {
      await updateStatus("cancelled");
    }
  };

  const generateAwb = async () => {
    if (!order.velocityWarehouseId && !order.pickupAddress) {
      toast.error("Set a Velocity warehouse on this order first");
      return;
    }
    setShippingLoading(true);
    try {
      const resp = await velocityService.createForwardShipment({ orderId: order.id });
      toast.success(`AWB generated: ${resp.data.awb_code} via ${resp.data.carrier_name}`);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`AWB generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setShippingLoading(false);
    }
  };

  const fetchLiveTracking = async () => {
    const awb = order.awb;
    if (!awb) { toast.error("No AWB on this order yet"); return; }
    setTrackingLoading(true);
    try {
      const resp = await velocityService.trackShipment({ awb, orderId: order.id });
      setLiveActivities(resp.data.activities);
      toast.success("Tracking updated");
    } catch (err: unknown) {
      toast.error(`Tracking failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTrackingLoading(false);
    }
  };

  const createReturnPickup = async () => {
    if (!confirm(`Create return pickup for order ${order.id}?`)) return;
    setShippingLoading(true);
    try {
      const resp = await velocityService.createReverseShipment({ orderId: order.id });
      toast.success(`Return pickup created: AWB ${resp.data.awb_code}`);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`Return pickup failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setShippingLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base">Order {order.id}</SheetTitle>
              <p className="text-xs text-text-muted mt-0.5">{order.date}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
        </SheetHeader>

        <div className="p-5 space-y-5">
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

          {/* Shipment Info */}
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <Truck className="h-3.5 w-3.5" /> Shipment Details
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Hash, label: "AWB", value: order.awb || order.velocityShipmentId || "—", copyable: true },
                { icon: Truck, label: "Courier", value: order.courierName || order.courier || "—" },
                { icon: Weight, label: "Weight", value: order.weight },
                { icon: IndianRupee, label: "Amount", value: `₹${order.amount}` },
              ].map(item => (
                <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.icon className="h-3 w-3 text-text-muted" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{item.label}</span>
                    {item.copyable && item.value !== "—" && (
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

            {/* Velocity Charges */}
            {(order.shippingCharges !== undefined || order.codCharges !== undefined) && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3 grid grid-cols-3 gap-2 text-center">
                {order.shippingCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Shipping</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.shippingCharges}</p>
                  </div>
                )}
                {order.codCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">COD Fee</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.codCharges}</p>
                  </div>
                )}
                {order.rtoCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">RTO</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.rtoCharges}</p>
                  </div>
                )}
              </div>
            )}

            {/* Label download */}
            {order.labelUrl && (
              <div className="mt-3 flex gap-2">
                <a href={order.labelUrl} download className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2 h-9 text-text-secondary hover:text-primary hover:border-primary/30">
                    <Download className="h-3.5 w-3.5" /> Download Label
                  </Button>
                </a>
                <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2 h-9 text-text-secondary hover:text-primary hover:border-primary/30">
                    <ExternalLink className="h-3.5 w-3.5" /> Open Label
                  </Button>
                </a>
              </div>
            )}
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

          <Separator />

          {/* Timeline */}
          <section>
            <h4 className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <span className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> Shipment Timeline</span>
              {order.awb && (
                <button
                  onClick={fetchLiveTracking}
                  disabled={trackingLoading}
                  className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80 disabled:opacity-50"
                >
                  {trackingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </button>
              )}
            </h4>

            {/* Live Velocity tracking activities */}
            {(liveActivities ?? order.trackingActivities)?.length ? (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {(liveActivities ?? order.trackingActivities)!.map((act, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-text-primary font-medium">{act.activity}</p>
                      <span className="text-[10px] text-text-muted whitespace-nowrap">{act.date}</span>
                    </div>
                    {act.location && <p className="text-xs text-text-muted mt-0.5">{act.location}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4">
                <TimelineTracker steps={steps} currentStep={currentStep} />
              </div>
            )}
          </section>

          <Separator />

          {/* Update Status */}
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <RefreshCw className="h-3.5 w-3.5" /> Update Status
            </h4>
            <Select onValueChange={updateStatus} disabled={updating}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Change status..." />
              </SelectTrigger>
              <SelectContent>
                {allStatuses.filter(s => s !== order.status).map(s => (
                  <SelectItem key={s} value={s}>{s.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {updating && <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Updating...</p>}
          </section>

          <Separator />

          {/* Quick Actions */}
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2 pb-4">
              {/* Generate AWB – show only when no AWB yet */}
              {!order.awb && (
                <Button
                  className="gap-2 h-10 bg-primary text-primary-foreground hover:bg-primary/90 col-span-2"
                  onClick={generateAwb}
                  disabled={shippingLoading || updating}
                >
                  {shippingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Generate AWB / Ship Now
                </Button>
              )}

              <Button variant="outline" className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30" onClick={() => printShippingLabel(order)}>
                <Printer className="h-4 w-4" /> Print Label
              </Button>
              <Button variant="outline" className="gap-2 h-10 text-warning hover:bg-warning-light hover:border-warning/30" onClick={() => updateStatus('ndr')}>
                <AlertTriangle className="h-4 w-4" /> Raise NDR
              </Button>

              {/* Return pickup – show when delivered or ndr */}
              {(order.status === "delivered" || order.status === "ndr") && (
                <Button
                  variant="outline"
                  className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30 col-span-2"
                  onClick={createReturnPickup}
                  disabled={shippingLoading}
                >
                  {shippingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Create Return Pickup
                </Button>
              )}

              <Button
                variant="outline"
                className="gap-2 h-10 text-danger hover:bg-danger-light hover:border-danger/30 col-span-2"
                onClick={cancelOrder}
                disabled={updating}
              >
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
