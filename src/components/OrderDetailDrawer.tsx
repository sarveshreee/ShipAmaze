import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { TimelineTracker } from "@/components/TimelineTracker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Order } from "@/data/mockData";
import {
  User, Phone, MapPin, Package, Truck, Printer, XCircle, AlertTriangle,
  Hash, Weight, IndianRupee, Calendar, Box, Copy, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface OrderDetailDrawerProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
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

export function OrderDetailDrawer({ order, open, onClose }: OrderDetailDrawerProps) {
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

          <Separator />

          {/* Timeline */}
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <Calendar className="h-3.5 w-3.5" /> Shipment Timeline
            </h4>
            <div className="rounded-xl border border-border bg-card p-4">
              <TimelineTracker steps={steps} currentStep={currentStep} />
            </div>
          </section>

          <Separator />

          {/* Actions */}
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2 pb-4">
              <Button variant="outline" className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30" onClick={() => toast.success(`Label generated for ${order.id}`)}>
                <Printer className="h-4 w-4" /> Print Label
              </Button>
              <Button variant="outline" className="gap-2 h-10 text-text-secondary hover:text-secondary hover:border-secondary/30" onClick={() => toast.info(`Status update dialog for ${order.id}`)}>
                <RefreshCw className="h-4 w-4" /> Update Status
              </Button>
              <Button variant="outline" className="gap-2 h-10 text-warning hover:bg-warning-light hover:border-warning/30" onClick={() => toast.warning(`NDR raised for ${order.id}`)}>
                <AlertTriangle className="h-4 w-4" /> Raise NDR
              </Button>
              <Button variant="outline" className="gap-2 h-10 text-danger hover:bg-danger-light hover:border-danger/30" onClick={() => toast.error(`Order ${order.id} cancelled`)}>
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
