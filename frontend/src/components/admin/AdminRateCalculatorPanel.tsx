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
  rateForZoneWeight,
} from "@/lib/shippingRateCardUtils";
import { getRates, type VelocityRate } from "@/services/velocityService";

const ZONES = ["A", "B", "C", "D", "E"];
const WEIGHT_SLABS = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

type ShipmentType = "forward" | "return";
type PaymentType = "COD" | "Prepaid";

export type AdminCalcResult = {
  zone: string;
  chargedWeight: number;
  chargedSlab: string;
  paymentType: PaymentType;
  shipmentType: ShipmentType;
  rate: number;
  pickupPin: string;
  deliveryPin: string;
};

type Props = {
  pincodeByPin: Map<string, PincodeService>;
  resolveRatesMatrix: (payment: PaymentType) => Promise<number[][]>;
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

export function AdminRateCalculatorPanel({ pincodeByPin, resolveRatesMatrix }: Props) {
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
  const [result, setResult] = useState<AdminCalcResult | null>(null);
  const [velocityQuotes, setVelocityQuotes] = useState<VelocityRate[] | null>(null);

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

    const zoneRecord = pincodeByPin.get(delivery);
    const zone = zoneRecord?.zone?.trim();

    setCalculating(true);
    setResult(null);
    setVelocityQuotes(null);
    try {
      if (zone) {
        const matrix = await resolveRatesMatrix(calcPaymentType);
        const rate = rateForZoneWeight(matrix, ZONES, zone, charged, WEIGHT_SLABS);
        if (rate == null) {
          toast.error(`No rate in zone-card for zone ${zone} — falling back to live courier rates`);
        } else {
          setResult({
            zone,
            chargedWeight: charged,
            chargedSlab: chargedWeightSlabLabel(WEIGHT_SLABS, charged),
            paymentType: calcPaymentType,
            shipmentType,
            rate,
            pickupPin: pickup,
            deliveryPin: delivery,
          });
          return;
        }
      }
      // Velocity live-rate fallback
      const resp = await getRates({
        from: pickup,
        to: delivery,
        weight: charged,
        length: Number(dimL) || undefined,
        width: Number(dimW) || undefined,
        height: Number(dimH) || undefined,
        payment_mode: calcPaymentType === "COD" ? "cod" : "prepaid",
        cod_value: calcPaymentType === "COD" ? Number(shipmentValue) || undefined : undefined,
        shipment_type: shipmentType,
      });
      const quotes = (resp.data ?? []).filter((q) => q.total_charge > 0);
      if (!quotes.length) {
        toast.info("No courier rates found for this route — pincode may not be serviceable");
      } else {
        setVelocityQuotes(quotes);
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
          Estimates shipping from the current zone rate card ({calcPaymentType}) — no live courier API.
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
                {deliveryInfo.zone ? ` · Zone ${deliveryInfo.zone}` : ""}
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

      {result && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border bg-surface-2/50 dark:bg-muted/30">
            <h4 className="font-semibold text-text-primary">Estimated Rate Result</h4>
            <p className="text-xs text-text-muted mt-0.5">
              {result.pickupPin} → {result.deliveryPin} · {result.shipmentType === "forward" ? "Forward" : "Return"}
            </p>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-text-muted">Zone</p>
              <p className="font-semibold text-primary">Zone {result.zone}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Charged Weight</p>
              <p className="font-semibold text-text-primary">
                {result.chargedWeight.toFixed(2)} kg
                <span className="text-xs font-normal text-text-muted ml-1">({result.chargedSlab} slab)</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Payment Type</p>
              <p className="font-medium text-text-primary">{result.paymentType === "COD" ? "Cash on Delivery" : "Prepaid"}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Estimated Rate</p>
              <p className="text-lg font-bold text-primary">₹{formatRateAmount(result.rate)}</p>
            </div>
          </div>
        </div>
      )}

      {velocityQuotes && velocityQuotes.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border bg-surface-2/50 dark:bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-text-primary">Live Courier Rates</h4>
              <Badge variant="outline" className="text-[10px]">via Velocity</Badge>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {pickupNorm} → {deliveryNorm} · {shipmentType === "forward" ? "Forward" : "Return"} · {calcPaymentType}
            </p>
          </div>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {velocityQuotes.map((q, idx) => (
              <div key={`${q.carrier_id}-${idx}`} className="p-4 flex items-center gap-4 hover:bg-surface-2/30 transition-colors">
                <Truck className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary">{q.carrier_name}</p>
                  <p className="text-xs text-text-muted">
                    {q.zone ? `Zone ${q.zone}` : "—"}
                    {q.tat ? ` · ${q.tat}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary">₹{formatRateAmount(q.total_charge)}</p>
                  {q.cod_charge ? (
                    <p className="text-[10px] text-text-muted">incl. ₹{formatRateAmount(q.cod_charge)} COD</p>
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
