import { type Order } from "@/data/mockData";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { Package, MapPin, Truck, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrderCardListProps {
  orders: Order[];
  onViewOrder?: (order: Order) => void;
}

export function OrderCardList({ orders, onViewOrder }: OrderCardListProps) {
  return (
    <div className="space-y-3">
      {orders.map(order => (
        <div key={order.id}
          className="rounded-xl bg-card border border-border p-4 space-y-3 active:scale-[0.99] transition-transform"
          >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-mono text-xs text-primary font-semibold">{order.id}</p>
                <p className="text-[10px] text-text-muted">{order.date}</p>
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* Customer */}
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-text-primary">{order.customer}</p>
              <p className="text-xs text-text-muted flex items-center gap-1">
                <MapPin className="h-3 w-3" />{order.city} — {order.pincode}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-text-primary">₹{order.amount.toLocaleString()}</p>
              <PaymentBadge type={order.payment} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Truck className="h-3.5 w-3.5 text-text-muted" />
              <span>{order.courier}</span>
              <span className="text-text-muted">·</span>
              <span>{order.weight}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted" onClick={e => { e.stopPropagation(); window.open(`/order-detail?id=${order.id}`, '_blank'); }}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted" onClick={e => e.stopPropagation()}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
