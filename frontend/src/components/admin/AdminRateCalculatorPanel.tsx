import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Calculator, Loader2, MapPin, Package, Scale, Truck } from "lucide-react";
import { toast } from "sonner";
import type { PincodeService } from "@/types/logistics";
import {
  chargedWeightSlabLabel,
  computeApplicableWeightKg,
  computeVolumetricWeightKg,
  formatRateAmount,
  normalizeZoneCode,
  weightSlabMultiplier,
} from "@/lib/shippingRateCardUtils";
import { DEFAULT_WEIGHTS } from "@/lib/courierPricingUtils";
import * as approvalService from "@/services/approvalService";

type ShipmentType = "forward" | "return";
type PaymentType = "COD" | "Prepaid";

type CourierRate = {
  courier: string;
  zone: string;
  freightCharge: number;
  codCharge?: number;
  totalCharge: number;
  multiplier?: number;
};

type Props = {
  pincodeByPin: Map<string, PincodeService>;
  resolveRatesMatrix?: (payment: PaymentType) => Promise<number[][]>;
};

function normalizePin(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function segmentBtn(active: boolean) {
  return cn(
    "flex-1 rounded-lg py-2.5 px-3 text-sm font-medium border transition-colors",
    active
      ? "bg-primary text-primary-foreground border-primary shadow-sm"
      : "bg-surface-2 text-text-secondary border-border hover:bg-surface-2/80 dark:hover:bg-muted/60"
  );
}

export function AdminRateCalculatorPanel({ pincodeByPin }: Props) {
  const [shipmentType, setShipmentType] = useState<ShipmentType>("forward");
  const [pickupPin, setPickupPin] = useState("");
  const [deliveryPin, setDeliveryPin] = useState("");
  const [actualWeight, setActualWeight] = useState("0.5");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [calcPaymentType, setCalcPaymentType] = useState<PaymentType>("Prepaid");
  const [shipmentValue, setShipmentValue] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [courierRates, setCourierRates] = useState<CourierRate[] | null>(null);
  const [calcSummary, setCalcSummary] = useState<{ pickup: string; delivery: string; weight: string } | null>(null);

  const pickupNorm = normalizePin(pickupPin);
  const deliveryNorm = normalizePin(deliveryPin);
  const pickupInfo = pickupNorm.length === 6 ? pincodeByPin.get(pickupNorm) : undefined;
  const deliveryInfo = deliveryNorm.length === 6 ? pincodeByPin.get(deliveryNorm) : undefined;

  const volumetricWeight = useMemo(() => {
    const l = Number(dimL);
    const w = Number(dimW);
    const h = Number(dimH);
    if (!dimL.trim() && !dimW.trim() && !dimH.trim()) return null;
    return computeVolumetricWeightKg(l, w, h);
  }, [dimL, dimW, dimH]);

  const applicableWeight = useMemo(() => {
    const actual = Number(actualWeight);
    return computeApplicableWeightKg(actual, volumetricWeight);
  }, [actualWeight, volumetricWeight]);

  const runCalculator = async () => {
    const pickup = normalizePin(pickupPin);
    const delivery = normalizePin(deliveryPin);
    const actual = Number(actualWeight);

    if (pickup.length !== 6) {
      toast.error("Enter a valid 6-digit pickup pincode");
      return;
    }
    if (delivery.length !== 6) {
      toast.error("Enter a valid 6-digit delivery pincode");
      return;
    }
    if (!(actual > 0) || !Number.isFinite(actual)) {
      toast.error("Enter a valid actual weight in kg");
      return;
    }

    const l = Number(dimL);
    const w = Number(dimW);
    const h = Number(dimH);
    const hasAnyDim = dimL.trim() || dimW.trim() || dimH.trim();
    if (hasAnyDim && (!(l > 0) || !(w > 0) || !(h > 0))) {
      toast.error("Enter length, width, and height (cm), each greater than 0");
      return;
    }

    if (calcPaymentType === "COD") {
      const sv = Number(shipmentValue);
      if (!shipmentValue.trim() || !(sv > 0) || !Number.isFinite(sv)) {
        toast.error("Enter shipment value for COD orders");
        return;
      }
    }

    const vol = hasAnyDim ? computeVolumetricWeightKg(l, w, h) : null;
    const charged = computeApplicableWeightKg(actual, vol);
    if (charged == null) {
      toast.error("Could not determine applicable weight");
      return;
    }

    setCalculating(true);
    setCourierRates(null);
    setCalcSummary(null);
    try {
      const rateCard = await approvalService.getShippingRateCard(calcPaymentType);
      const rows = (rateCard?.courierZoneRows ?? []).filter((r) => r.active !== false);
      const displayRowsByCourier = new Map<string, (typeof rows)[number]>();
      rows.forEach((row) => {
        const key = row.courier.toLowerCase();
        const existing = displayRowsByCourier.get(key);
        if (!existing || normalizeZoneCode(row.zone) === "A") {
          displayRowsByCourier.set(key, row);
        }
      });

      const results: CourierRate[] = [];
      const { slabIdx, multiplier } = weightSlabMultiplier(DEFAULT_WEIGHTS, charged);

      for (const row of displayRowsByCourier.values()) {
        const baseFreight = Number(row.rates[slabIdx] ?? 0);
        if (!(baseFreight > 0)) continue;
        const freight = baseFreight * multiplier;
        const codCharge = calcPaymentType === "COD" ? Number(row.codCharge ?? 0) : undefined;
        const total = freight + (codCharge ?? 0);
        results.push({
          courier: row.courier,
          zone: row.zone,
          freightCharge: freight,
          codCharge: codCharge && codCharge > 0 ? codCharge : undefined,
          totalCharge: total,
          multiplier,
        });
      }

      if (!results.length) {
        toast.info("No courier rates configured in the Rate Card — add rates in Rates & Shipping page");
      } else {
        results.sort((a, b) => a.totalCharge - b.totalCharge);
        setCourierRates(results);
        setCalcSummary({
          pickup,
          delivery,
          weight: chargedWeightSlabLabel(DEFAULT_WEIGHTS, charged),
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="rounded-lg bg-card shadow-card p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Rate Calculator
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Shows courier prices from the admin-configured Courier Rate Card.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Shipment Type</Label>
          <div className="flex gap-2 mt-1.5">
            {(
              [
                { id: "forward" as const, label: "Forward" },
                { id: "return" as const, label: "Return" },
              ] as const
            ).map((t) => (
              <button key={t.id} type="button" onClick={() => setShipmentType(t.id)} className={segmentBtn(shipmentType === t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Pickup Pincode</Label>
            <Input
              placeholder="400001"
              value={pickupPin}
              onChange={(e) => setPickupPin(e.target.value)}
              maxLength={6}
              inputMode="numeric"
            />
            {pickupInfo && (
              <p className="text-xs text-text-muted flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {pickupInfo.city}, {pickupInfo.state}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Delivery Pincode</Label>
            <Input
              placeholder="110001"
              value={deliveryPin}
              onChange={(e) => setDeliveryPin(e.target.value)}
              maxLength={6}
              inputMode="numeric"
            />
            {deliveryInfo && (
              <p className="text-xs text-text-muted flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {deliveryInfo.city}, {deliveryInfo.state}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Actual Weight (Kg)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.5"
            value={actualWeight}
            onChange={(e) => setActualWeight(e.target.value)}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Dimensions (cm)</Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            <div>
              <Input placeholder="Length" type="number" min="0" step="0.1" value={dimL} onChange={(e) => setDimL(e.target.value)} />
              <span className="text-[10px] text-text-muted mt-0.5 block">Length</span>
            </div>
            <div>
              <Input placeholder="Width" type="number" min="0" step="0.1" value={dimW} onChange={(e) => setDimW(e.target.value)} />
              <span className="text-[10px] text-text-muted mt-0.5 block">Width</span>
            </div>
            <div>
              <Input placeholder="Height" type="number" min="0" step="0.1" value={dimH} onChange={(e) => setDimH(e.target.value)} />
              <span className="text-[10px] text-text-muted mt-0.5 block">Height</span>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Payment Type</Label>
          <div className="flex gap-2 mt-1.5">
            {(["Prepaid", "COD"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setCalcPaymentType(t)} className={segmentBtn(calcPaymentType === t)}>
                {t === "COD" ? "Cash on Delivery" : "Prepaid"}
              </button>
            ))}
          </div>
        </div>

        {calcPaymentType === "COD" && (
          <div className="space-y-1.5">
            <Label>Shipment Value (₹)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 999"
              value={shipmentValue}
              onChange={(e) => setShipmentValue(e.target.value)}
            />
          </div>
        )}
      </div>

      {(volumetricWeight != null || applicableWeight != null) && (
        <div className="rounded-xl border border-border bg-surface-2/50 dark:bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Volumetric Weight</p>
              <p className="font-medium text-text-primary">
                {volumetricWeight != null ? `${volumetricWeight.toFixed(2)} kg` : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Scale className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Applicable Weight</p>
              <p className="font-medium text-text-primary">
                {applicableWeight != null ? `${applicableWeight.toFixed(2)} kg` : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full bg-primary text-primary-foreground hover:bg-primary-dark"
        disabled={calculating}
        onClick={() => void runCalculator()}
      >
        {calculating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Calculator className="h-4 w-4 mr-2" />
            Calculate Rates
          </>
        )}
      </Button>

      {courierRates && courierRates.length > 0 && calcSummary && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border bg-surface-2/50 dark:bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-text-primary">Courier Rates</h4>
              <Badge variant="outline" className="text-[10px]">Rate Card</Badge>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {calcSummary.pickup} → {calcSummary.delivery} · {calcSummary.weight} · {calcPaymentType}
            </p>
          </div>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {courierRates.map((q, idx) => (
              <div key={`${q.courier}-${idx}`} className="p-4 flex items-center gap-4 hover:bg-surface-2/30 transition-colors">
                <Truck className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary">{q.courier}</p>
                  {q.multiplier && q.multiplier > 1 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      {q.multiplier}× slab rate (weight exceeds max slab)
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary">₹{formatRateAmount(q.totalCharge)}</p>
                  {q.codCharge ? (
                    <p className="text-[10px] text-text-muted">incl. ₹{formatRateAmount(q.codCharge)} COD</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
