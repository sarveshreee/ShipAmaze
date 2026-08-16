import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Save, Loader2, Package, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { usePickupAddresses } from "@/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ProcessSelectedPayload } from "@/services/orderService";
import {
  discoverServiceability,
  groupCouriersByProvider,
  providerDisplayName,
  type DiscoveredCourier,
} from "@/services/courierDiscoveryService";
import { providerSupports } from "@/lib/providerCapabilities";
import { CourierCard } from "@/components/CourierCard";
import { CourierPriorityConfigModal } from "@/components/CourierPriorityConfigModal";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/logistics";
import { getOrderLineItems } from "@/lib/orderSkuValidation";
import * as orderService from "@/services/orderService";

const WEIGHT_DIMENSION_PRESETS: Record<string, { weight: string; l: string; w: string; h: string }> = {
  "0.5": { weight: "0.5", l: "1", w: "1", h: "1" },
  "1": { weight: "1", l: "1", w: "1", h: "1" },
  "2": { weight: "2", l: "2", w: "2", h: "2" },
  "5": { weight: "5", l: "5", w: "5", h: "5" },
};

const modalSelectTriggerClass =
  "mt-1.5 h-11 w-full border-2 border-primary/15 bg-popover text-popover-foreground shadow-sm transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/30 disabled:opacity-60";

const modalInputClass =
  "border-2 border-primary/15 bg-background/90 focus-visible:ring-primary/30 focus-visible:border-primary/35 shadow-sm";

type CourierSelectionMode = "priority" | "courier";

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
  /** Full selected orders — used for mandatory SKU entry before booking. */
  selectedOrders?: Order[];
  submitting?: boolean;
  processProgress?: { done: number; total: number } | null;
  initialPickupId?: string;
  initialCourierCarrierId?: string;
  fixedCourierFromFilter?: {
    courierName: string;
    carrierId?: string;
    pickupId: string;
  };
  onProcess: (payload: ProcessSelectedPayload) => Promise<void>;
}

export function ProcessSelectedModal({
  open,
  onClose,
  orderIds,
  couriers: _couriers,
  referenceOrders = [],
  selectedOrders = [],
  submitting = false,
  processProgress = null,
  initialPickupId,
  initialCourierCarrierId,
  fixedCourierFromFilter,
  onProcess,
}: Props) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { data: userPickups = [] } = usePickupAddresses(
    role === "admin"
      ? { scope: "platform", enabled: open }
      : role === "dropshipper"
        ? { ownership: "own", enabled: open }
        : { enabled: open }
  );
  const activePickups = useMemo(() => userPickups.filter((a) => a.isActive !== false), [userPickups]);

  const [shipmentMode, setShipmentMode] = useState<"" | "forward" | "reverse">("");
  const [pickupAddr, setPickupAddr] = useState("");
  const [returnAddr, setReturnAddr] = useState("");
  const [courierMode, setCourierMode] = useState<CourierSelectionMode>("priority");
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [selectedCarrierName, setSelectedCarrierName] = useState("");
  const [selectedCarrierProvider, setSelectedCarrierProvider] = useState<string>("velocity");
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [weightPreset, setWeightPreset] = useState("other");
  const [serviceableCouriers, setServiceableCouriers] = useState<DiscoveredCourier[]>([]);
  const [serviceableLoading, setServiceableLoading] = useState(false);
  const [priorityConfigOpen, setPriorityConfigOpen] = useState(false);
  const [skuDrafts, setSkuDrafts] = useState<Record<string, string>>({});

  type SkuTask = { order: Order; lineIndex: number; productName: string };

  const skuTasks = useMemo((): SkuTask[] => {
    const tasks: SkuTask[] = [];
    for (const order of selectedOrders) {
      const items = getOrderLineItems(order);
      items.forEach((item, lineIndex) => {
        if (!String(item.sku ?? "").trim()) {
          const name = String(
            (item as { name?: string; productName?: string }).name ??
              (item as { productName?: string }).productName ??
              ""
          ).trim();
          tasks.push({ order, lineIndex, productName: name || `Line ${lineIndex + 1}` });
        }
      });
    }
    return tasks;
  }, [selectedOrders]);

  const allSkusReady = useMemo(() => {
    if (selectedOrders.length === 0) return true;
    return selectedOrders.every((order) => {
      const items = getOrderLineItems(order);
      if (items.length === 0) return false;
      return items.every((item, lineIndex) => {
        const existing = String(item.sku ?? "").trim();
        if (existing) return true;
        if (!isAdmin) return false;
        const key = `${order.id}:${lineIndex}`;
        return Boolean(skuDrafts[key]?.trim());
      });
    });
  }, [selectedOrders, skuDrafts, isAdmin]);

  useEffect(() => {
    if (!open) {
      setShipmentMode("");
      setPickupAddr("");
      setReturnAddr("");
      setCourierMode("priority");
      setSelectedCarrierId("");
      setSelectedCarrierName("");
      setSelectedCarrierProvider("velocity");
      setWeight("");
      setDimL("");
      setDimW("");
      setDimH("");
      setWeightPreset("other");
      setServiceableCouriers([]);
      setPriorityConfigOpen(false);
      setSkuDrafts({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (fixedCourierFromFilter) {
      setPickupAddr(fixedCourierFromFilter.pickupId);
      setCourierMode("courier");
      setSelectedCarrierId(fixedCourierFromFilter.carrierId?.trim() ?? "");
      setSelectedCarrierName(fixedCourierFromFilter.courierName);
      setShipmentMode("forward");
      return;
    }
    const defaultPickup =
      (initialPickupId &&
        activePickups.find((a) => a.id === initialPickupId)?.id) ||
      activePickups.find((a) => a.isDefault && a.velocityWarehouseId?.trim())?.id ||
      activePickups.find((a) => a.velocityWarehouseId?.trim())?.id ||
      activePickups.find((a) => a.isDefault)?.id ||
      activePickups[0]?.id ||
      "";
    if (defaultPickup) setPickupAddr(defaultPickup);
    if (initialCourierCarrierId?.trim()) {
      setCourierMode("courier");
      setSelectedCarrierId(initialCourierCarrierId.trim());
    }
    setShipmentMode("forward");
  }, [open, activePickups, initialPickupId, initialCourierCarrierId, fixedCourierFromFilter]);

  const pickupPincode = useMemo(() => {
    const p = activePickups.find((a) => a.id === pickupAddr);
    return String(p?.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  }, [activePickups, pickupAddr]);

  const selectedPickup = useMemo(
    () => activePickups.find((a) => a.id === pickupAddr),
    [activePickups, pickupAddr]
  );
  /** Booking requires a real Lorrigo pickup id — not just a SUCCESS badge. */
  const lorrigoPickupReady = Boolean(selectedPickup?.lorrigoPickupId?.trim());
  /** Velocity booking requires a linked Velocity warehouse on the selected pickup. */
  const velocityPickupReady = Boolean(selectedPickup?.velocityWarehouseId?.trim());

  const destPincode = useMemo(() => {
    for (const o of referenceOrders) {
      const pin = String(o.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      if (pin.length === 6) return pin;
    }
    return "";
  }, [referenceOrders]);

  const uniqueDestPincodes = useMemo(() => {
    const pins = new Set<string>();
    for (const o of referenceOrders) {
      const pin = String(o.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      if (pin.length === 6) pins.add(pin);
    }
    return [...pins];
  }, [referenceOrders]);

  const referencePayment = useMemo(() => {
    const o = referenceOrders[0];
    if (!o?.payment) return "prepaid" as const;
    return String(o.payment).toLowerCase().includes("cod") ? ("cod" as const) : ("prepaid" as const);
  }, [referenceOrders]);

  const hasPickupPin = pickupPincode.length === 6;
  const hasDestPin = destPincode.length === 6;

  useEffect(() => {
    if (!open || fixedCourierFromFilter || shipmentMode !== "forward" || !hasPickupPin || !hasDestPin) {
      if (!fixedCourierFromFilter) setServiceableCouriers([]);
      return;
    }
    let cancelled = false;
    setServiceableLoading(true);
    void discoverServiceability({
      from: pickupPincode,
      to: destPincode,
      payment_mode: referencePayment,
      shipment_type: "forward",
    })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []).filter(
          (c) => String(c.courierId || c.carrier_id || "").trim() !== ""
        );
        setServiceableCouriers(rows);
        if (courierMode === "courier" && selectedCarrierId) {
          const stillValid = rows.some(
            (c) =>
              String(c.courierId || c.carrier_id) === selectedCarrierId &&
              (c.provider || "velocity") === selectedCarrierProvider
          );
          if (!stillValid) {
            setSelectedCarrierId("");
            setSelectedCarrierName("");
            setSelectedCarrierProvider("velocity");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setServiceableCouriers([]);
      })
      .finally(() => {
        if (!cancelled) setServiceableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    shipmentMode,
    pickupPincode,
    destPincode,
    referencePayment,
    hasPickupPin,
    hasDestPin,
    fixedCourierFromFilter,
    courierMode,
    selectedCarrierId,
    selectedCarrierProvider,
  ]);

  const displayCouriers = useMemo(() => {
    if (fixedCourierFromFilter) {
      return [
        {
          carrier_id: fixedCourierFromFilter.carrierId ?? fixedCourierFromFilter.courierName,
          carrier_name: fixedCourierFromFilter.courierName,
          provider: "velocity" as const,
        },
      ];
    }
    return serviceableCouriers
      .filter((c) => {
        const provider = c.provider || "velocity";
        // Hide Lorrigo couriers until the selected pickup has a real lorrigoPickupId.
        if (provider === "lorrigo" && !lorrigoPickupReady) return false;
        // Hide Velocity couriers until the selected pickup is linked to a Velocity warehouse.
        if (provider === "velocity" && !velocityPickupReady) return false;
        return true;
      })
      .map((c) => {
        const priceRaw = c.totalCharge ?? c.total_charge ?? c.freight ?? c.freightCharge ?? c.freight_charge;
        const price = typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : null;
        return {
          carrier_id: String(c.courierId || c.carrier_id),
          carrier_name: String(c.courierName || c.carrier_name || c.courierId || c.carrier_id),
          provider: (c.provider === "lorrigo"
            ? "lorrigo"
            : c.provider === "ekart"
              ? "ekart"
              : "velocity") as "velocity" | "lorrigo" | "ekart",
          price,
        };
      });
  }, [serviceableCouriers, fixedCourierFromFilter, lorrigoPickupReady, velocityPickupReady]);

  const courierSections = useMemo(
    () => groupCouriersByProvider(displayCouriers),
    [displayCouriers]
  );

  const validationMessages = useMemo(() => {
    if (!open) return [] as string[];
    const msgs: string[] = [];
    if (referenceOrders.length > 0 && !hasDestPin) {
      msgs.push("Selected order does not contain a valid destination pincode.");
    }
    if (pickupAddr && !hasPickupPin) {
      msgs.push("Selected pickup address does not contain a valid pincode.");
    }
    if (
      pickupAddr &&
      !lorrigoPickupReady &&
      serviceableCouriers.some((c) => (c.provider || "") === "lorrigo")
    ) {
      msgs.push(
        role === "admin"
          ? "Lorrigo couriers are hidden until this pickup address is synced to Lorrigo (use Sync / Retry Sync on Pickup Addresses)."
          : "Some couriers are hidden until this pickup address is synced. Use Sync / Retry Sync on Pickup Addresses."
      );
    }
    if (
      pickupAddr &&
      !velocityPickupReady &&
      serviceableCouriers.some((c) => (c.provider || "velocity") === "velocity")
    ) {
      msgs.push(
        role === "admin"
          ? "Velocity couriers are hidden until this pickup address is linked to a Velocity warehouse (use Sync warehouse on Pickup Addresses)."
          : "Velocity couriers are hidden until this pickup address is synced. Open Pickup Addresses and click Sync warehouse."
      );
    }
    return msgs;
  }, [
    open,
    referenceOrders.length,
    hasDestPin,
    pickupAddr,
    hasPickupPin,
    lorrigoPickupReady,
    velocityPickupReady,
    serviceableCouriers,
    role,
  ]);

  const handlePreset = (val: string) => {
    setWeightPreset(val);
    if (val === "other") return;
    const preset = WEIGHT_DIMENSION_PRESETS[val];
    if (preset) {
      setWeight(preset.weight);
      setDimL(preset.l);
      setDimW(preset.w);
      setDimH(preset.h);
    }
  };

  const selectCourier = (carrierId: string, carrierName: string, provider?: string) => {
    setSelectedCarrierId(carrierId);
    setSelectedCarrierName(carrierName);
    setSelectedCarrierProvider(provider || "velocity");
  };

  // Drop a selected Lorrigo courier if the pickup is no longer Lorrigo-ready.
  useEffect(() => {
    if (!lorrigoPickupReady && selectedCarrierProvider === "lorrigo") {
      setSelectedCarrierId("");
      setSelectedCarrierName("");
      setSelectedCarrierProvider("velocity");
    }
  }, [lorrigoPickupReady, selectedCarrierProvider]);

  // Drop a selected Velocity courier if the pickup is not linked to a Velocity warehouse.
  useEffect(() => {
    if (!velocityPickupReady && selectedCarrierProvider === "velocity" && selectedCarrierId) {
      setSelectedCarrierId("");
      setSelectedCarrierName("");
    }
  }, [velocityPickupReady, selectedCarrierProvider, selectedCarrierId]);

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

    const mode: CourierSelectionMode = fixedCourierFromFilter ? "courier" : courierMode;

    if (mode === "courier") {
      if (!selectedCarrierId.trim() || !selectedCarrierName.trim()) {
        toast.error("Select a courier to book with");
        return;
      }
      if (!providerSupports(selectedCarrierProvider, "booking")) {
        toast.error("Selected courier provider does not support booking yet.");
        return;
      }
      if (selectedCarrierProvider === "velocity" && !velocityPickupReady) {
        toast.error("Sync this pickup address to Velocity before booking a Velocity courier.");
        return;
      }
      if (selectedCarrierProvider === "lorrigo" && !lorrigoPickupReady) {
        toast.error("Sync this pickup address to Lorrigo before booking a Lorrigo courier.");
        return;
      }
    }

    if (!allSkusReady) {
      toast.error("SKU is mandatory on every line item before processing.");
      return;
    }

    try {
      if (isAdmin) {
        for (const task of skuTasks) {
          const key = `${task.order.id}:${task.lineIndex}`;
          const sku = skuDrafts[key]?.trim();
          if (sku) {
            await orderService.patchOrderLineItemSku(task.order.id, task.lineIndex, sku);
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save SKU");
      return;
    }

    const payload: ProcessSelectedPayload = {
      orderIds,
      pickupAddressId: pickupAddr,
      courierSelectionMode: mode,
      courierName: mode === "priority" ? "Priority" : selectedCarrierName,
      carrierId: mode === "courier" ? selectedCarrierId : undefined,
      provider:
        mode === "courier"
          ? selectedCarrierProvider === "lorrigo"
            ? "lorrigo"
            : selectedCarrierProvider === "ekart"
              ? "ekart"
              : "velocity"
          : "velocity",
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

  const showCourierCards = !fixedCourierFromFilter && courierMode === "courier";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto border-2 border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.05] shadow-2xl p-0 gap-0">
          <div className="border-b border-primary/15 bg-gradient-to-r from-primary/10 via-card to-secondary/10 px-6 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-text-primary">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Package className="h-5 w-5" />
                </span>
                Process selected orders ({orderIds.length})
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-muted mt-2 pr-4">
              {role === "dropshipper" ? (
                <>
                  You can process only your own orders, using pickup addresses you added.
                  Couriers are booked with a real AWB and charged at the admin rate card.
                </>
              ) : (
                <>
                  Orders are booked via the selected courier provider (Velocity, Lorrigo, or Ekart when enabled)
                  with a real AWB. Dropshippers are charged your admin Rate Card price (Rates &amp; Shipping),
                  not the provider&apos;s actual freight.
                </>
              )}
              {fixedCourierFromFilter && (
                <>
                  {" "}
                  Each selected order was already verified serviceable for{" "}
                  <strong className="text-primary">{fixedCourierFromFilter.courierName}</strong> from your pickup filter.
                </>
              )}
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">
                  Shipment mode<span className="text-danger">*</span>
                </Label>
                <Select
                  value={shipmentMode || "__none__"}
                  onValueChange={(v) => setShipmentMode(v === "__none__" ? "" : (v as typeof shipmentMode))}
                >
                  <SelectTrigger className={modalSelectTriggerClass}>
                    <SelectValue placeholder="Select shipment mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="__none__">-- Select --</SelectItem>
                    <SelectItem value="forward">Forward</SelectItem>
                    <SelectItem value="reverse">Reverse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Pickup address<span className="text-danger">*</span>
                </Label>
                <Select
                  value={pickupAddr || "__none__"}
                  onValueChange={(v) => setPickupAddr(v === "__none__" ? "" : v)}
                  disabled={Boolean(fixedCourierFromFilter)}
                >
                  <SelectTrigger className={modalSelectTriggerClass}>
                    <SelectValue placeholder="Select pickup…" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground max-h-60">
                    <SelectItem value="__none__">Select pickup…</SelectItem>
                    {activePickups.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role === "dropshipper" && activePickups.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                    Add a pickup address first.{" "}
                    <Link to="/dropshipper/pickup-addresses" className="underline font-medium">
                      Open Pickup Addresses
                    </Link>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Return address{shipmentMode === "reverse" ? <span className="text-danger">*</span> : ""}
                </Label>
                <Select
                  value={returnAddr || "__none__"}
                  onValueChange={(v) => setReturnAddr(v === "__none__" ? "" : v)}
                  disabled={shipmentMode !== "reverse"}
                >
                  <SelectTrigger className={modalSelectTriggerClass}>
                    <SelectValue placeholder={shipmentMode === "reverse" ? "Select return…" : "N/A (forward)"} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground max-h-60">
                    <SelectItem value="__none__">
                      {shipmentMode === "reverse" ? "Select return…" : "N/A (forward)"}
                    </SelectItem>
                    {activePickups.map((a) => (
                      <SelectItem key={`r-${a.id}`} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!fixedCourierFromFilter && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">
                    Choose Courier<span className="text-danger">*</span>
                  </Label>
                  <RadioGroup
                    value={courierMode}
                    onValueChange={(v) => setCourierMode(v as CourierSelectionMode)}
                    className="mt-3 flex flex-wrap gap-6"
                  >
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-text-primary">
                      <RadioGroupItem value="priority" id="courier-mode-priority" />
                      Priority Selection
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-text-primary">
                      <RadioGroupItem value="courier" id="courier-mode-courier" />
                      Courier Selection
                    </label>
                  </RadioGroup>
                </div>

                {courierMode === "priority" && (
                  <p className="text-xs text-text-muted rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2">
                    Each order will be booked using your saved priority list — starting from Priority #1 for every
                    order, falling back to the next courier if the lane is not serviceable. Velocity, Lorrigo,
                    and Ekart couriers are supported when configured.
                  </p>
                )}

                {showCourierCards && (
                  <div>
                    <Label className="text-sm font-medium">
                      Courier<span className="text-danger">*</span>
                    </Label>

                    {serviceableLoading && (
                      <p className="text-[11px] text-text-muted mt-2 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading serviceable couriers…
                      </p>
                    )}

                    {!serviceableLoading && displayCouriers.length === 0 && hasPickupPin && hasDestPin && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                        No serviceable couriers for this pickup and destination pincode.
                      </p>
                    )}

                    {displayCouriers.length > 0 && (
                      <div className="space-y-5 mt-3">
                        {courierSections.map((section) => (
                          <div key={section.provider}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                              {providerDisplayName(section.provider)}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {section.items.map((c) => (
                                <CourierCard
                                  key={`${c.provider}:${c.carrier_id}`}
                                  carrierId={c.carrier_id}
                                  carrierName={c.carrier_name}
                                  provider={c.provider}
                                  price={"price" in c ? c.price : null}
                                  selected={
                                    selectedCarrierId === c.carrier_id &&
                                    selectedCarrierProvider === c.provider
                                  }
                                  onClick={() =>
                                    selectCourier(c.carrier_id, c.carrier_name, c.provider)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {uniqueDestPincodes.length > 1 && (
                      <p className="text-[11px] text-text-muted mt-2">
                        {orderIds.length} orders across {uniqueDestPincodes.length} pincodes — couriers shown for the
                        first selected lane. The backend verifies each order&apos;s lane before booking.
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
                )}
              </div>
            )}

            {fixedCourierFromFilter && (
              <div>
                <Label className="text-sm font-medium">Courier</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 max-w-xs">
                  <CourierCard
                    carrierId={displayCouriers[0]?.carrier_id ?? ""}
                    carrierName={displayCouriers[0]?.carrier_name ?? fixedCourierFromFilter.courierName}
                    selected
                  />
                </div>
                {uniqueDestPincodes.length > 1 && (
                  <p className="text-[11px] text-text-muted mt-1">
                    {orderIds.length} orders across {uniqueDestPincodes.length} pincodes — each is booked with{" "}
                    {fixedCourierFromFilter.courierName} using per-order Velocity serviceability.
                  </p>
                )}
              </div>
            )}

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
                  className={cn("flex-1", modalInputClass)}
                />
                <span className="flex items-center text-sm font-semibold text-primary px-3 bg-primary/10 rounded-lg border-2 border-primary/20">
                  kg
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-secondary/20 bg-secondary/[0.06] p-4 space-y-3">
              <Label className="text-sm font-semibold text-text-primary">
                Dimensions (cm)<span className="text-danger">*</span>
              </Label>
              <div className="flex gap-2 items-center flex-wrap">
                <Input value={dimL} onChange={(e) => setDimL(e.target.value)} placeholder="L" type="number" className={cn("w-24", modalInputClass)} />
                <span className="text-primary font-bold">×</span>
                <Input value={dimW} onChange={(e) => setDimW(e.target.value)} placeholder="W" type="number" className={cn("w-24", modalInputClass)} />
                <span className="text-primary font-bold">×</span>
                <Input value={dimH} onChange={(e) => setDimH(e.target.value)} placeholder="H" type="number" className={cn("w-24", modalInputClass)} />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: "0.5 kg", val: "0.5" },
                  { label: "1 kg", val: "1" },
                  { label: "2 kg", val: "2" },
                  { label: "5 kg", val: "5" },
                  { label: "Other", val: "other" },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => handlePreset(p.val)}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-bold transition-all border-2",
                      weightPreset === p.val
                        ? "bg-primary text-white border-primary shadow-md shadow-primary/25"
                        : "bg-background border-primary/20 text-text-secondary hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {skuTasks.length > 0 && (
            <div className="mx-6 mb-4 rounded-lg border-2 border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-200">
                {isAdmin
                  ? "SKU required — enter SKU for each line item before processing"
                  : "SKU is missing on some orders. Ask admin to add SKU before you can process."}
              </p>
              {isAdmin &&
                skuTasks.map((task) => {
                const key = `${task.order.id}:${task.lineIndex}`;
                return (
                  <div key={key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div>
                      <Label className="text-xs text-text-muted">Order</Label>
                      <p className="text-sm font-mono truncate">{task.order.orderId ?? task.order.id}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-text-muted">{task.productName}</Label>
                      <Input
                        className={cn("mt-1 h-9 font-mono", modalInputClass)}
                        placeholder="Enter SKU *"
                        value={skuDrafts[key] ?? ""}
                        onChange={(e) =>
                          setSkuDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={submitting}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {submitting && processProgress && processProgress.total > 0 && (
            <p className="text-sm text-text-muted px-6 pb-2">
              Booking shipments… {processProgress.done} / {processProgress.total} orders
            </p>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-3 px-6 py-4 border-t border-border/60 bg-surface-2/30">
            {!fixedCourierFromFilter && isAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPriorityConfigOpen(true)}
                disabled={submitting}
                className="h-10 gap-2 mr-auto border-2 border-primary/25 text-primary hover:bg-primary/10"
              >
                <Settings2 className="h-4 w-4" />
                Priority Selection
              </Button>
            )}
            <div className="flex gap-3 sm:ml-auto">
              <Button
                onClick={() => void handleSubmit()}
                disabled={submitting || !allSkusReady}
                className="h-10 gap-2 px-6 font-bold bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:brightness-105 border-0"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {submitting && processProgress
                  ? `Processing (${processProgress.done}/${processProgress.total})`
                  : "Submit"}
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="h-10 px-6 font-semibold border-2 border-secondary/30 text-secondary-dark hover:bg-secondary hover:text-white"
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin && (
        <CourierPriorityConfigModal
          open={priorityConfigOpen}
          onClose={() => setPriorityConfigOpen(false)}
          pickupAddressId={pickupAddr || undefined}
          fromPin={pickupPincode || undefined}
          destPincode={destPincode || undefined}
          paymentMode={referencePayment}
        />
      )}
    </>
  );
}
