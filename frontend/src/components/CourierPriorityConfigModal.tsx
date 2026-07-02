import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CourierCard } from "@/components/CourierCard";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import {
  getBulkCourierPriority,
  listVelocityCarriersForLane,
  saveBulkCourierPriority,
  type BulkCourierPriorityEntry,
  type VelocityLaneCarrier,
} from "@/services/bulkCourierPriorityService";

const REFERENCE_DEST_PIN = "110001";

type Props = {
  open: boolean;
  onClose: () => void;
  pickupAddressId?: string;
  destPincode?: string;
  paymentMode?: "cod" | "prepaid";
};

export function CourierPriorityConfigModal({
  open,
  onClose,
  pickupAddressId,
  destPincode,
  paymentMode = "prepaid",
}: Props) {
  const [priorities, setPriorities] = useState<BulkCourierPriorityEntry[]>([]);
  const [available, setAvailable] = useState<VelocityLaneCarrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const laneToPin = destPincode?.replace(/\D/g, "").slice(0, 6) || REFERENCE_DEST_PIN;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [saved, velocity] = await Promise.all([
        getBulkCourierPriority(),
        listVelocityCarriersForLane({
          pickupAddressId,
          toPin: laneToPin,
          payment_mode: paymentMode,
        }).catch(() => ({ items: [] as VelocityLaneCarrier[] })),
      ]);
      setPriorities(saved.priorities ?? []);
      setAvailable(velocity.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load courier priority");
    } finally {
      setLoading(false);
    }
  }, [pickupAddressId, laneToPin, paymentMode]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const priorityIds = useMemo(
    () => new Set(priorities.map((p) => `${p.carrierId || ""}::${p.courierName}`.toLowerCase())),
    [priorities]
  );

  const addable = useMemo(
    () =>
      available.filter(
        (c) => !priorityIds.has(`${c.carrier_id}::${c.carrier_name}`.toLowerCase())
      ),
    [available, priorityIds]
  );

  const move = (idx: number, dir: -1 | 1) => {
    setPriorities((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((p, i) => ({ ...p, rank: i + 1 }));
    });
  };

  const remove = (idx: number) => {
    setPriorities((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, rank: i + 1 })));
  };

  const add = (carrier: VelocityLaneCarrier) => {
    setPriorities((prev) => [
      ...prev,
      {
        courierName: carrier.carrier_name,
        carrierId: carrier.carrier_id,
        rank: prev.length + 1,
      },
    ]);
  };

  const handleSave = async () => {
    if (priorities.length === 0) {
      toast.error("Add at least one courier to the priority list");
      return;
    }
    setSaving(true);
    try {
      await saveBulkCourierPriority(priorities);
      toast.success("Courier priority saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save priority");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Priority Selection</DialogTitle>
          <p className="text-sm text-text-muted">
            Arrange couriers in order of preference. During bulk processing, the system tries Priority #1 first,
            then falls back to the next courier if the lane is not serviceable.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-muted gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading couriers…
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-semibold text-text-primary">
                Priority order<span className="text-danger">*</span>
              </Label>
              {priorities.length === 0 ? (
                <p className="text-sm text-text-muted mt-2">No couriers in the list. Add couriers below.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {priorities.map((p, idx) => (
                    <li
                      key={`${p.carrierId}-${p.courierName}-${idx}`}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"
                    >
                      <GripVertical className="h-4 w-4 text-text-muted shrink-0" />
                      <span className="text-xs font-bold text-primary w-6">#{idx + 1}</span>
                      <span className="flex-1 text-sm font-medium text-text-primary truncate">{p.courierName}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={idx === 0}
                          onClick={() => move(idx, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={idx === priorities.length - 1}
                          onClick={() => move(idx, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => remove(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold text-text-primary">Add courier</Label>
              <p className="text-xs text-text-muted mt-1 mb-3">
                Couriers from Velocity for pickup → {laneToPin}
                {!destPincode && " (reference lane — order pincodes may differ)"}.
              </p>
              {addable.length === 0 ? (
                <p className="text-sm text-text-muted">All available couriers are already in the list.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {addable.map((c) => (
                    <div key={c.carrier_id} className="relative">
                      <CourierCard
                        carrierId={c.carrier_id}
                        carrierName={c.carrier_name}
                        compact
                        onClick={() => add(c)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute -top-2 -right-2 h-7 w-7 rounded-full shadow-md"
                        onClick={() => add(c)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loading || priorities.length === 0}
            className="gap-2 bg-primary text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving} className="gap-2">
            <X className="h-4 w-4" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
