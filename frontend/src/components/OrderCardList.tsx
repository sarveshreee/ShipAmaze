import { useMemo, useState } from "react";
import type { Order } from "@/types/logistics";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { ExpandableText, ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { EditSkuModal } from "@/components/EditSkuModal";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { Package, MapPin, Truck, Eye, Printer, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface OrderCardListProps {
  orders: Order[];
  onViewOrder?: (order: Order) => void;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllVisible?: (ids: string[]) => void;
  onClearSelection?: () => void;
}

function orderAddressLines(order: Order): string {
  const o = order as Order & { address2?: string; shippingAddress2?: string };
  const lines = [
    order.address,
    o.address2 || o.shippingAddress2,
    [order.city, order.state].filter(Boolean).join(", "),
    order.pincode,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return lines.join("\n");
}

export function OrderCardList({
  orders,
  onViewOrder,
  selected,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
}: OrderCardListProps) {
  const { canEditSku } = useDropshipperAccess();
  const [editSku, setEditSku] = useState<{ order: Order; lineIndex: number } | null>(null);
  const selectionEnabled = Boolean(onToggleSelect && selected);
  const allVisibleSelected = useMemo(
    () => orders.length > 0 && orders.every((o) => selected?.has(o.id)),
    [orders, selected]
  );
  const someVisibleSelected = useMemo(
    () => orders.some((o) => selected?.has(o.id)),
    [orders, selected]
  );

  return (
    <>
      {selectionEnabled && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
            <Checkbox
              checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
              onCheckedChange={(v) => {
                if (v) onSelectAllVisible?.(orders.map((o) => o.id));
                else onClearSelection?.();
              }}
            />
            Select all on page
          </label>
          {selected && selected.size > 0 && (
            <span className="text-xs text-text-muted tabular-nums">{selected.size} selected</span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => {
          const isSelected = selected?.has(order.id) ?? false;
          const addressText = orderAddressLines(order);
          return (
            <div
              key={order.id}
              role="button"
              tabIndex={0}
              className={cn(
                "rounded-xl bg-card border p-3 sm:p-4 space-y-3 active:scale-[0.99] transition-transform cursor-pointer overflow-hidden",
                isSelected ? "border-primary ring-1 ring-primary/30" : "border-border"
              )}
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
                  {selectionEnabled && (
                    <Checkbox
                      checked={isSelected}
                      className="shrink-0"
                      onCheckedChange={() => onToggleSelect?.(order.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
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
                  <p className="font-medium text-text-primary">{order.customer}</p>
                  <div className="mt-1 flex items-start gap-1 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-text-muted" />
                    {addressText ? (
                      <ExpandableText text={addressText} clampLines={3} className="flex-1" />
                    ) : (
                      <span className="text-xs text-text-muted">
                        {[order.city, order.pincode].filter(Boolean).join(" — ") || "—"}
                      </span>
                    )}
                  </div>
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
          );
        })}
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
