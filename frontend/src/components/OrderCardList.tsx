import { useState } from "react";
import type { Order } from "@/types/logistics";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { EditSkuModal } from "@/components/EditSkuModal";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { Package, MapPin, Truck, Eye, Printer, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrderCardListProps {
  orders: Order[];
  onViewOrder?: (order: Order) => void;
}

export function OrderCardList({ orders, onViewOrder }: OrderCardListProps) {
  const { canEditSku } = useDropshipperAccess();
  const [editSku, setEditSku] = useState<{ order: Order; lineIndex: number } | null>(null);

  return (
    <>
      <div className="space-y-3">
        {orders.map((order) => (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            className="rounded-xl bg-card border border-border p-3 sm:p-4 space-y-3 active:scale-[0.99] transition-transform cursor-pointer overflow-hidden"
            onClick={() => onViewOrder?.(order)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onViewOrder?.(order);
              }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-light">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] sm:text-xs text-primary font-semibold truncate" title={order.id}>
                    {order.id}
                  </p>
                  <p className="text-[10px] text-text-muted">{order.date}</p>
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge status={order.status} />
              </div>
            </div>

            {(() => {
              const products = order.products ?? order.items ?? [];
              if (products.length === 0) return null;
              return (
                <div className="border-t border-border/60 pt-2 space-y-2">
                  {products.map((product, index) => (
                    <div key={index} className={cn(index > 0 && "pt-2 border-t border-border/50")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Product Name</p>
                          <ProductNameText product={product} compact />
                        </div>
                        {canEditSku ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-text-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditSku({ order, lineIndex: index });
                            }}
                          >
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">SKU</p>
                        <SkuBadge product={{ sku: (product as { sku?: string }).sku }} index={index} compact />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary truncate">{order.customer}</p>
                <p className="text-xs text-text-muted flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{order.city} — {order.pincode}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-text-primary">₹{order.amount.toLocaleString()}</p>
                <PaymentBadge type={order.payment} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary min-w-0">
                <Truck className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="truncate">{order.courier}</span>
                <span className="text-text-muted shrink-0">·</span>
                <span className="shrink-0">{order.weight}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-text-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/order-detail?id=${order.id}`, "_blank");
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-text-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Printer className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <EditSkuModal
        open={!!editSku}
        onClose={() => setEditSku(null)}
        order={editSku?.order ?? null}
        lineIndex={editSku?.lineIndex ?? 0}
        onSaved={() => window.dispatchEvent(new Event("shipamaze:refetch:orders"))}
      />
    </>
  );
}
