import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { Order } from "@/types/logistics";
import * as orderService from "@/services/orderService";
import { ApiError } from "@/lib/apiClient";
import { toast } from "sonner";
import { ProductLineDisplay } from "@/components/ProductLineDisplay";

type EditSkuModalProps = {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  lineIndex: number;
  onSaved?: (order: Order) => void;
};

function lineItems(order: Order): Record<string, unknown>[] {
  const raw =
    (order as { orderItems?: unknown[] }).orderItems ??
    order.items ??
    order.products ??
    [];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

export function EditSkuModal({ open, onClose, order, lineIndex, onSaved }: EditSkuModalProps) {
  const [sku, setSku] = useState("");
  const [loading, setLoading] = useState(false);

  const lines = order ? lineItems(order) : [];
  const line = lines[lineIndex];

  useEffect(() => {
    if (!open || !line) return;
    setSku(String(line.sku ?? "").trim());
  }, [open, line, lineIndex]);

  const save = async () => {
    if (!order) return;
    const trimmed = sku.trim();
    if (!trimmed) {
      toast.error("SKU cannot be empty");
      return;
    }
    setLoading(true);
    try {
      const res = await orderService.patchOrderLineItemSku(order.id, lineIndex, trimmed);
      toast.success("SKU updated");
      onSaved?.(res.order);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to update SKU");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle>Edit SKU</DialogTitle>
          <DialogDescription>
            Order {order?.id} · Line {lineIndex + 1}
          </DialogDescription>
        </DialogHeader>
        {line ? (
          <div className="space-y-4">
            <ProductLineDisplay
              product={{
                name: String(line.name ?? ""),
                sku: String(line.sku ?? ""),
                qty: Number(line.qty ?? 1),
              }}
              index={lineIndex}
              showQty
            />
            <div>
              <Label htmlFor="edit-sku">SKU *</Label>
              <Input
                id="edit-sku"
                className="mt-1 font-mono"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Enter SKU"
                disabled={loading}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={loading || !order}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save SKU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
