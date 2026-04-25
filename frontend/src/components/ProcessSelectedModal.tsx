import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { usePickupAddresses } from "@/hooks/useApiData";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onSubmit: () => void;
}

export function ProcessSelectedModal({ open, onClose, selectedCount, onSubmit }: Props) {
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const [shipmentMode, setShipmentMode] = useState("");
  const [pickupAddr, setPickupAddr] = useState("");
  const [returnAddr, setReturnAddr] = useState("");
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [weightPreset, setWeightPreset] = useState("other");
  const [courierMode, setCourierMode] = useState("priority");

  const handlePreset = (val: string) => {
    setWeightPreset(val);
    if (val !== "other") setWeight(val);
  };

  const handleSubmit = () => {
    if (!shipmentMode) { toast.error("Select Shipment Mode"); return; }
    if (!pickupAddr) { toast.error("Select Pickup Address"); return; }
    if (!returnAddr) { toast.error("Select Return Address"); return; }
    if (!weight) { toast.error("Enter weight"); return; }
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Order Process</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Row 1: Shipment Mode, Pickup, Return */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Select Shipment Mode<span className="text-danger">*</span></Label>
              <select value={shipmentMode} onChange={e => setShipmentMode(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">-- Select --</option>
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Pickup Address<span className="text-danger">*</span></Label>
              <select value={pickupAddr} onChange={e => setPickupAddr(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Search by pickup address...</option>
                {pickupAddresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Return Address<span className="text-danger">*</span></Label>
              <select value={returnAddr} onChange={e => setReturnAddr(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Search by return address...</option>
                {pickupAddresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Weight + Dimensions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Actual Weight<span className="text-danger">*</span></Label>
              <div className="flex gap-2 mt-1">
                <Input value={weight} onChange={e => { setWeight(e.target.value); setWeightPreset("other"); }} placeholder="Enter weight..." type="number" className="flex-1" />
                <span className="flex items-center text-sm text-text-muted px-3 bg-surface-2 rounded-md border border-border">KG</span>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Dimensions<span className="text-danger">*</span></Label>
              <div className="flex gap-1.5 mt-1 items-center">
                <Input value={dimL} onChange={e => setDimL(e.target.value)} placeholder="Length" type="number" />
                <span className="text-text-muted font-bold">×</span>
                <Input value={dimW} onChange={e => setDimW(e.target.value)} placeholder="Width" type="number" />
                <span className="text-text-muted font-bold">×</span>
                <Input value={dimH} onChange={e => setDimH(e.target.value)} placeholder="Height" type="number" />
                <span className="flex items-center text-sm text-text-muted px-3 bg-surface-2 rounded-md border border-border whitespace-nowrap">cm</span>
              </div>
            </div>
          </div>

          {/* Weight presets */}
          <div className="flex flex-wrap gap-4">
            {[{ label: "0.5 KG", val: "0.5" }, { label: "1 KG", val: "1" }, { label: "2 KG", val: "2" }, { label: "5 KG", val: "5" }, { label: "Other", val: "other" }].map(p => (
              <label key={p.val} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="radio" name="weight-preset-modal" className="accent-primary" checked={weightPreset === p.val} onChange={() => handlePreset(p.val)} />
                {p.label}
              </label>
            ))}
          </div>

          {/* Courier mode */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Choose Courier<span className="text-danger">*</span></Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="radio" name="courier-mode-modal" className="accent-primary" checked={courierMode === "priority"} onChange={() => setCourierMode("priority")} />
                Priority Selection
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="radio" name="courier-mode-modal" className="accent-primary" checked={courierMode === "courier"} onChange={() => setCourierMode("courier")} />
                Courier Selection
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            <Save className="h-4 w-4" /> Submit
          </Button>
          <Button variant="secondary" onClick={onClose} className="bg-sidebar text-sidebar-primary-foreground hover:bg-sidebar-accent">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
