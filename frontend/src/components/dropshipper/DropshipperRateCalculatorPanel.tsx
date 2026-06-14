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
  buildDropshipperRateQuotes,
  formatQuoteAmount,
  rateQuoteSourceLabel,
  type DropshipperRateQuote,
} from "@/lib/dropshipperRateQuote";
import {
  chargedWeightSlabLabel,
  computeApplicableWeightKg,
  computeVolumetricWeightKg,
} from "@/lib/shippingRateCardUtils";
import { DEFAULT_WEIGHTS } from "@/lib/courierPricingUtils";

type ShipmentType = "forward" | "return";
type PaymentMode = "prepaid" | "cod";

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

type Props = {
  pincodeByPin: Map<string, PincodeService>;
};

export function DropshipperRateCalculatorPanel({ pincodeByPin }: Props) {
  const [shipmentType, setShipmentType] = useState<ShipmentType>("forward");
  const [pickupPin, setPickupPin] = useState("");
  const [deliveryPin, setDeliveryPin] = useState("");
  const [actualWeight, setActualWeight] = useState("0.5");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("prepaid");
  const [shipmentValue, setShipmentValue] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [quotes, setQuotes] = useState<DropshipperRateQuote[] | null>(null);
  const [summary, setSummary] = useState<{
    pickupPin: string;
    deliveryPin: string;
    zone: string;
    applicableWeight: number;
    chargedSlab: string;
  } | null>(null);

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

    if (paymentMode === "cod") {
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
    if (!zone) {
      toast.error("Delivery pincode not in serviceability list — check Pincode Check tab");
      setQuotes(null);
      setSummary(null);
      return;
    }

    setCalculating(true);
    setQuotes(null);
    try {
      const results = await buildDropshipperRateQuotes({
        pickupPin: pickup,
        deliveryPin: delivery,
        applicableWeightKg: charged,
        paymentMode,
        shipmentType,
        shipmentValue: paymentMode === "cod" ? Number(shipmentValue) : undefined,
        deliveryZone: zone,
        lengthCm: hasAnyDim ? l : undefined,
        widthCm: hasAnyDim ? w : undefined,
        heightCm: hasAnyDim ? h : undefined,
      });
      setQuotes(results);
      setSummary({
        pickupPin: pickup,
        deliveryPin: delivery,
        zone,
        applicableWeight: charged,
        chargedSlab: chargedWeightSlabLabel(DEFAULT_WEIGHTS, charged),
      });
      if (!results.length) toast.info("No courier rates found for these parameters");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="rounded-lg bg-card shadow-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Rate Calculator
          </h3>
          <p className="text-xs text-text-muted mt-1">
            View-only estimate — live Velocity rates, then admin courier masters, then zone card fallback.
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
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setShipmentType(t.id)}
                  className={segmentBtn(shipmentType === t.id)}
                >
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
                readOnly={false}
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

          {(volumetricWeight != null || applicableWeight != null) && (
            <div className="rounded-lg border border-border bg-surface-2/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <Package className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-text-muted text-xs">Volumetric Weight</p>
                  <p className="font-medium text-text-primary">
                    {volumetricWeight != null ? `${volumetricWeight.toFixed(2)} kg` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Scale className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-text-muted text-xs">Applicable Weight</p>
                  <p className="font-medium text-text-primary">
                    {applicableWeight != null ? `${applicableWeight.toFixed(2)} kg` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">Payment Type</Label>
            <div className="flex gap-2 mt-1.5">
              {(["prepaid", "cod"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setPaymentMode(t)} className={segmentBtn(paymentMode === t)}>
                  {t === "cod" ? "Cash on Delivery" : "Prepaid"}
                </button>
              ))}
            </div>
          </div>

          {paymentMode === "cod" && (
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

        <Button
          type="button"
          className="w-full bg-primary text-primary-foreground hover:bg-primary-dark"
          onClick={() => void runCalculator()}
          disabled={calculating}
        >
          {calculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
          Calculate Rates
        </Button>
      </div>

      {quotes !== null && (
        <div className="rounded-lg bg-card shadow-card overflow-hidden">
          <div className="p-4 border-b border-border bg-surface-2/50">
            <h3 className="font-semibold text-text-primary">Courier-wise Rates</h3>
            {summary && (
              <p className="text-xs text-text-muted mt-1">
                {summary.pickupPin} → {summary.deliveryPin} · Zone {summary.zone} · {summary.applicableWeight.toFixed(2)} kg (
                {summary.chargedSlab}) · {paymentMode === "cod" ? "COD" : "Prepaid"} · {shipmentType === "return" ? "Return" : "Forward"}
              </p>
            )}
          </div>
          {quotes.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">No courier rates available for these parameters.</div>
          ) : (
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
              {quotes.map((q, idx) => (
                <div key={`${q.courier}-${q.source}-${idx}`} className="p-4 flex items-center gap-4 hover:bg-surface-2/30 transition-colors">
                  <Truck className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-text-primary">{q.courier}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {rateQuoteSourceLabel(q.source)}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-muted">
                      {q.zone ? `Zone ${q.zone}` : "—"}
                      {q.tat ? ` · ${q.tat}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-primary">₹{formatQuoteAmount(q.totalCharge)}</p>
                    {q.codCharge ? (
                      <p className="text-[10px] text-text-muted">incl. ₹{formatQuoteAmount(q.codCharge)} COD</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
