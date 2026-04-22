import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";

export const MOVABLE_STATUSES = [
  { value: "ready-to-ship", label: "Ready to Ship" },
  { value: "pending-pickup", label: "Pending Pickup" },
  { value: "in-transit", label: "In Transit" },
  { value: "out-for-delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  currentStatusSummary: { status: string; count: number }[];
  onConfirm: (newStatus: string) => void;
}

export function MoveToModal({ open, onClose, selectedCount, currentStatusSummary, onConfirm }: Props) {
  const [target, setTarget] = useState<string>("");

  useEffect(() => {
    if (open) setTarget("");
  }, [open]);

  const labelFor = (s: string) => MOVABLE_STATUSES.find(m => m.value === s)?.label || s;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Move {selectedCount > 1 ? "Selected Orders" : "Order"}</DialogTitle>
          <DialogDescription>
            Move {selectedCount} selected order{selectedCount !== 1 ? "s" : ""} to a new shipping stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Current Status</p>
            {currentStatusSummary.length === 0 ? (
              <p className="text-sm text-text-secondary">No orders selected</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentStatusSummary.map(s => (
                  <span key={s.status} className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-2.5 py-0.5 text-xs">
                    <span className="font-medium">{labelFor(s.status)}</span>
                    <span className="text-text-muted">× {s.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Move To</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select destination status" />
              </SelectTrigger>
              <SelectContent>
                {MOVABLE_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!target || selectedCount === 0}
            className="bg-primary text-primary-foreground hover:bg-primary-dark"
            onClick={() => target && onConfirm(target)}
          >
            Confirm Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
