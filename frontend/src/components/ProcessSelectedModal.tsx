import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { usePickupAddresses } from "@/hooks/useApiData";
import { toast } from "sonner";
import type { ProcessSelectedPayload } from "@/services/orderService";
import { listCourierRateMasters, type CourierRateMaster } from "@/services/courierRateService";
import { resolveSlabRate } from "@/lib/courierRateSlab";

export type ProcessSelectedOrderRef = {
  pincode?: string;
  payment?: string;
  amount?: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  orderIds: string[];
  couriers: Array<{ id: string; name: string; carrierId?: string }>;
  referenceOrders?: ProcessSelectedOrderRef[];
  submitting?: boolean;
  onProcess: (payload: ProcessSelectedPayload) => Promise<void>;
}

export function ProcessSelectedModal({
  open,
  onClose,
  orderIds,
  couriers,
  referenceOrders = [],
  submitting = false,
  onProcess,
}: Props) {
  const { data: userPickups = [] } = usePickupAddresses();
  const pickupAddresses = userPickups;
  const activePickups = useMemo(() => pickupAddresses.filter((a) => a.isActive !== false), [pickupAddresses]);

  const [shipmentMode, setShipmentMode] = useState<"" | "forward" | "reverse">("");
  const [pickupAddr, setPickupAddr] = useState("");
  const [returnAddr, setReturnAddr] = useState("");
  const [courierSelect, setCourierSelect] = useState("");
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [weightPreset, setWeightPreset] = useState("other");
  const [rateMasters, setRateMasters] = useState<CourierRateMaster[]>([]);
  const [rateMastersLoading, setRateMastersLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setShipmentMode("");
      setPickupAddr("");
      setReturnAddr("");
      setCourierSelect("");
      setWeight("");
      setDimL("");
      setDimW("");
      setDimH("");
      setWeightPreset("other");
      setRateMasters([]);
      return;
    }
    let cancelled = false;
    setRateMastersLoading(true);
    void listCourierRateMasters()
      .then((res) => {
        if (cancelled) return;
        setRateMasters((res.items ?? []).filter((r) => r.active !== false));
      })
      .catch(() => {
        if (!cancelled) setRateMasters([]);
      })
      .finally(() => {
        if (!cancelled) setRateMastersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const defaultPickup =
      activePickups.find((a) => a.isDefault && a.velocityWarehouseId?.trim()) ??
      activePickups.find((a) => a.velocityWarehouseId?.trim()) ??
      activePickups.find((a) => a.isDefault) ??
      activePickups[0];
    if (defaultPickup && !pickupAddr) {
      setPickupAddr(defaultPickup.id);
    }
  }, [open, activePickups, pickupAddr]);

  const pickupPincode = useMemo(() => {
    const p = activePickups.find((a) => a.id === pickupAddr);
    return String(p?.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  }, [activePickups, pickupAddr]);

  const destPincode = useMemo(() => {
    for (const o of referenceOrders) {
      const pin = String(o.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      if (pin.length === 6) return pin;
    }
    return "";
  }, [referenceOrders]);

  const referencePayment = useMemo(() => {
    const o = referenceOrders[0];
    if (!o?.payment) return "prepaid" as const;
    return String(o.payment).toLowerCase().includes("cod") ? ("cod" as const) : ("prepaid" as const);
  }, [referenceOrders]);

  const weightNum = Number(weight);
  const hasValidWeight = Number.isFinite(weightNum) && weightNum > 0;
  const hasPickupPin = pickupPincode.length === 6;
  const hasDestPin = destPincode.length === 6;

  const validationMessages = useMemo(() => {
    if (!open) return [] as string[];
    const msgs: string[] = [];
    if (referenceOrders.length > 0 && !hasDestPin) {
      msgs.push("Selected order does not contain a valid destination pincode.");
    }
    if (pickupAddr && !hasPickupPin) {
      msgs.push("Selected pickup address does not contain a valid pincode.");
    }
    if (!hasValidWeight && rateMasters.length > 0) {
      msgs.push("Enter shipment weight to calculate admin courier rates.");
    }
    return msgs;
  }, [open, referenceOrders.length, hasDestPin, pickupAddr, hasPickupPin, hasValidWeight, rateMasters.length]);

  const manualCourierOptions = useMemo(() => {
    return rateMasters
      .slice()
      .sort(
        (a, b) =>
          (a.priority ?? 99) - (b.priority ?? 99) || a.courierName.localeCompare(b.courierName)
      )
      .map((r) => ({
        id: r.id,
        name: r.courierName,
        carrierId: r.carrierId?.trim() || undefined,
        charge: hasValidWeight
          ? resolveSlabRate(r.weightSlabs, weightNum, referencePayment)
          : null,
      }));
  }, [rateMasters, hasValidWeight, weightNum, referencePayment]);

  const manualCourierNames = useMemo(
    () => new Set(manualCourierOptions.map((c) => c.name.toLowerCase())),
    [manualCourierOptions]
  );

  const legacyDbCouriers = useMemo(
    () => couriers.filter((c) => !manualCourierNames.has(c.name.toLowerCase())),
    [couriers, manualCourierNames]
  );

  const handlePreset = (val: string) => {
    setWeightPreset(val);
    if (val !== "other") setWeight(val);
  };

  const resolveCourierPayload = (): { courierName: string; carrierId?: string } => {
    const sel = courierSelect.trim();
    if (!sel || sel.toLowerCase() === "auto") return { courierName: "Auto" };
    if (sel.startsWith("name:")) {
      const name = sel.slice(5).trim();
      const manual = manualCourierOptions.find((c) => c.name === name);
      if (manual?.carrierId) {
        return { courierName: manual.name, carrierId: manual.carrierId };
      }
      return { courierName: name };
    }
    if (sel.startsWith("rate:")) {
      const id = sel.slice(5).trim();
      const manual = manualCourierOptions.find((c) => c.id === id);
      if (manual) {
        return {
          courierName: manual.name,
          carrierId: manual.carrierId,
        };
      }
    }
    const db = couriers.find((c) => c.carrierId && c.carrierId === sel);
    if (db) {
      return { courierName: db.name, carrierId: db.carrierId };
    }
    const byName = couriers.find((c) => c.name === sel);
    if (byName) {
      return {
        courierName: byName.name,
        carrierId: byName.carrierId || undefined,
      };
    }
    return { courierName: sel, carrierId: sel };
  };

  const handleSubmit = async () => {
    if (orderIds.length === 0) {
      toast.error("No orders selected");
      return;
    }
    if (!shipmentMode) {
      toast.error("Select shipment mode");
      return;
    }
    if (!pickupAddr) {
      toast.error("Select pickup address");
      return;
    }
    if (shipmentMode === "reverse" && !returnAddr) {
      toast.error("Select return address");
      return;
    }
    const w = Number(weight);
    if (!(w > 0) || !Number.isFinite(w)) {
      toast.error("Enter a valid weight (kg)");
      return;
    }
    const L = Number(dimL);
    const W = Number(dimW);
    const H = Number(dimH);
    if (!(L > 0) || !(W > 0) || !(H > 0)) {
      toast.error("Enter length, width, and height (cm), each greater than 0");
      return;
    }

    const { courierName, carrierId } = resolveCourierPayload();

    const payload: ProcessSelectedPayload = {
      orderIds,
      pickupAddressId: pickupAddr,
      courierName,
      carrierId,
      shipmentMode,
      weight: w,
      length: L,
      width: W,
      height: H,
    };

    try {
      await onProcess(payload);
    } catch {
      /* parent shows toast */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Process selected orders ({orderIds.length})
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-muted">
          Selected orders move directly to <strong>Pending Pickup</strong> with the courier and pickup details you
          choose. Junk orders and orders that already have an AWB or shipment cannot be processed.
        </p>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">
                Shipment mode<span className="text-danger">*</span>
              </Label>
              <select
                value={shipmentMode}
                onChange={(e) => setShipmentMode(e.target.value as typeof shipmentMode)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">-- Select --</option>
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Pickup address<span className="text-danger">*</span>
              </Label>
              <select
                value={pickupAddr}
                onChange={(e) => setPickupAddr(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select pickup…</option>
                {activePickups.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                    {a.createdByRole === "vendor"
                      ? " (Vendor warehouse)"
                      : a.createdByRole === "admin"
                        ? " (Admin)"
                        : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Return address{shipmentMode === "reverse" ? <span className="text-danger">*</span> : ""}
              </Label>
              <select
                value={returnAddr}
                onChange={(e) => setReturnAddr(e.target.value)}
                disabled={shipmentMode !== "reverse"}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">{shipmentMode === "reverse" ? "Select return…" : "N/A (forward)"}</option>
                {activePickups.map((a) => (
                  <option key={`r-${a.id}`} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">
                Courier<span className="text-danger">*</span>
              </Label>
              <select
                value={courierSelect}
                onChange={(e) => setCourierSelect(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto — system assigns courier</option>
                {manualCourierOptions.map((c) => (
                  <option key={`rate-${c.id}`} value={`rate:${c.id}`}>
                    {c.name}
                    {c.charge != null ? ` — ₹${c.charge.toFixed(0)}` : ""}
                  </option>
                ))}
                {legacyDbCouriers.map((c) => (
                  <option key={`db-${c.id || c.name}`} value={`name:${c.name}`}>
                    {c.name}
                  </option>
                ))}
              </select>

              {rateMastersLoading && (
                <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading courier rates…
                </p>
              )}

              {!rateMastersLoading && manualCourierOptions.length > 0 && !hasValidWeight && (
                <p className="text-[11px] text-text-muted mt-1">
                  Enter weight to see slab pricing for couriers.
                </p>
              )}

              {validationMessages.length > 0 && (
                <div className="mt-2 space-y-1">
                  {validationMessages.map((msg) => (
                    <p key={msg} className="text-xs text-amber-700 dark:text-amber-400">
                      {msg}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">
                Weight (kg)<span className="text-danger">*</span>
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                    setWeightPreset("other");
                  }}
                  placeholder="e.g. 1.2"
                  type="number"
                  className="flex-1"
                />
                <span className="flex items-center text-sm text-text-muted px-3 bg-surface-2 rounded-md border border-border">
                  kg
                </span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">
              Dimensions (cm)<span className="text-danger">*</span>
            </Label>
            <div className="flex gap-1.5 items-center flex-wrap">
              <Input value={dimL} onChange={(e) => setDimL(e.target.value)} placeholder="L" type="number" className="w-24" />
              <span className="text-text-muted font-bold">×</span>
              <Input value={dimW} onChange={(e) => setDimW(e.target.value)} placeholder="W" type="number" className="w-24" />
              <span className="text-text-muted font-bold">×</span>
              <Input value={dimH} onChange={(e) => setDimH(e.target.value)} placeholder="H" type="number" className="w-24" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {[
              { label: "0.5 kg", val: "0.5" },
              { label: "1 kg", val: "1" },
              { label: "2 kg", val: "2" },
              { label: "5 kg", val: "5" },
              { label: "Other", val: "other" },
            ].map((p) => (
              <label key={p.val} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="radio"
                  name="weight-preset-modal"
                  className="accent-primary"
                  checked={weightPreset === p.val}
                  onChange={() => handlePreset(p.val)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Submit
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
