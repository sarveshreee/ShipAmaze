import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { usePickupAddresses } from "@/hooks/useApiData";
import { toast } from "sonner";
import type { ProcessSelectedPayload } from "@/services/orderService";

interface Props {
  open: boolean;
  onClose: () => void;
  orderIds: string[];
  couriers: Array<{ id: string; name: string }>;
  submitting?: boolean;
  onProcess: (payload: ProcessSelectedPayload) => Promise<void>;
}

export function ProcessSelectedModal({
  open,
  onClose,
  orderIds,
  couriers,
  submitting = false,
  onProcess,
}: Props) {
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const activePickups = useMemo(() => pickupAddresses.filter((a) => a.isActive !== false), [pickupAddresses]);

  const [shipmentMode, setShipmentMode] = useState<"" | "forward" | "reverse">("");
  const [pickupAddr, setPickupAddr] = useState("");
  const [returnAddr, setReturnAddr] = useState("");
  const [courierName, setCourierName] = useState("");
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [weightPreset, setWeightPreset] = useState("other");

  useEffect(() => {
    if (!open) {
      setShipmentMode("");
      setPickupAddr("");
      setReturnAddr("");
      setCourierName("");
      setWeight("");
      setDimL("");
      setDimW("");
      setDimH("");
      setWeightPreset("other");
    }
  }, [open]);

  const handlePreset = (val: string) => {
    setWeightPreset(val);
    if (val !== "other") setWeight(val);
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
    const autoCourier = !courierName || courierName.toLowerCase() === "auto";
    if (!autoCourier && !courierName.trim()) {
      toast.error("Select a courier");
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

    const payload: ProcessSelectedPayload = {
      orderIds,
      pickupAddressId: pickupAddr,
      courierName: autoCourier ? "Auto" : courierName.trim(),
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
          Only orders in <strong>Ready to Ship</strong> without an AWB can be processed. Others stay in the list but
          will fail validation if included.
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
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="Auto">Auto — system assigns courier</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
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
