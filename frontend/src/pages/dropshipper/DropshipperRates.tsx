import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { rateCardData } from "@/constants/rateCard";
import { cn } from "@/lib/utils";
import { Calculator, MapPin, Truck, CheckCircle2, XCircle, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as velocityService from "@/services/velocityService";
import type { VelocityRate, VelocityCarrier } from "@/services/velocityService";

export default function DropshipperRates() {
  const [tab, setTab] = useState<"calculator" | "rateCard" | "pincheck">("calculator");

  // Rate calculator state
  const [fromPin, setFromPin] = useState("");
  const [toPin, setToPin] = useState("");
  const [weight, setWeight] = useState("0.5");
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "cod">("prepaid");
  const [calcLoading, setCalcLoading] = useState(false);
  const [rateResults, setRateResults] = useState<VelocityRate[] | null>(null);

  // Pincode check state
  const [pincode, setPincode] = useState("");
  const [originPin, setOriginPin] = useState("400001");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinCarriers, setPinCarriers] = useState<VelocityCarrier[] | null>(null);
  const [pinNotServiceable, setPinNotServiceable] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const calculateRates = async () => {
    if (!fromPin || !toPin || !weight) {
      toast.error("Please fill in origin pincode, destination pincode, and weight");
      return;
    }
    if (fromPin.replace(/\D/g, "").length !== 6 || toPin.replace(/\D/g, "").length !== 6) {
      toast.error("Origin and destination pincodes must be 6 digits");
      return;
    }
    setCalcLoading(true);
    setRateResults(null);
    try {
      const resp = await velocityService.getRates({
        from: fromPin,
        to: toPin,
        weight: parseFloat(weight),
        payment_mode: paymentMode,
      });
      setRateResults(resp.data ?? []);
      if (!resp.data?.length) toast.info("No rates returned for these parameters");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch rates");
    } finally {
      setCalcLoading(false);
    }
  };

  const checkPin = async () => {
    const dest = pincode.replace(/\D/g, "").slice(0, 6);
    const origin = (originPin || "").replace(/\D/g, "").slice(0, 6);
    if (dest.length !== 6) {
      toast.error("Enter a valid 6-digit destination pincode");
      return;
    }
    if (origin.length !== 6) {
      toast.error("Enter a valid 6-digit origin pincode");
      return;
    }
    setPinLoading(true);
    setPinCarriers(null);
    setPinNotServiceable(false);
    setPinError(null);
    try {
      const resp = await velocityService.checkServiceability({
        from: origin,
        to: dest,
        payment_mode: "prepaid",
        shipment_type: "forward",
      });
      const ok = resp.serviceable !== false && (resp.data?.length ?? 0) > 0;
      if (ok) {
        setPinCarriers(resp.data ?? []);
      } else {
        setPinNotServiceable(true);
        if (resp.message) setPinError(resp.message);
      }
    } catch (e: unknown) {
      setPinNotServiceable(true);
      setPinError(e instanceof Error ? e.message : "Could not reach shipping service");
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Rates & Serviceability" breadcrumb={["Dropshipper", "Rates"]} />

      <div className="flex gap-1 border-b border-border mb-6">
        {(
          [
            { id: "calculator" as const, label: "Rate Calculator", icon: Calculator },
            { id: "rateCard" as const, label: "Rate Card", icon: Truck },
            { id: "pincheck" as const, label: "Pincode Check", icon: MapPin },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-text-secondary"
            )}
            type="button"
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calculator" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg bg-card shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4">Calculate Shipping Rate</h3>
            <div className="space-y-3">
              <div>
                <Label>Origin Pincode</Label>
                <Input placeholder="400001" value={fromPin} onChange={e => setFromPin(e.target.value)} maxLength={6} />
              </div>
              <div>
                <Label>Destination Pincode</Label>
                <Input placeholder="110001" value={toPin} onChange={e => setToPin(e.target.value)} maxLength={6} />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input placeholder="0.5" type="number" min="0.1" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
              <div>
                <Label>Payment Type</Label>
                <div className="flex gap-2 mt-1">
                  {(["prepaid", "cod"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPaymentMode(t)}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium border-2 transition-all capitalize",
                        paymentMode === t ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary"
                      )}
                    >
                      {t === "cod" ? "COD" : "Prepaid"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => void calculateRates()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary-dark"
                type="button"
                disabled={calcLoading}
              >
                {calcLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
                Calculate Rates
              </Button>
            </div>
          </div>

          {rateResults !== null && (
            <div className="rounded-lg bg-card shadow-card overflow-hidden">
              <div className="p-4 border-b border-border bg-surface-2/50">
                <h3 className="font-semibold text-text-primary">Available Couriers</h3>
                <p className="text-xs text-text-muted">{fromPin} → {toPin} · {weight} kg · {paymentMode === "cod" ? "COD" : "Prepaid"}</p>
              </div>
              {rateResults.length === 0 ? (
                <div className="p-6 text-center text-text-muted text-sm">No carriers available for these parameters</div>
              ) : (
                <div className="divide-y divide-border">
                  {rateResults.map((c) => (
                    <div key={c.carrier_id} className="p-4 flex items-center gap-4 hover:bg-surface-2/30 transition-colors">
                      <Truck className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-text-primary">{c.carrier_name}</p>
                        <p className="text-xs text-text-muted">
                          Zone {c.zone}{c.tat ? ` · ${c.tat}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">₹{c.total_charge}</p>
                        {c.cod_charge ? <p className="text-[10px] text-text-muted">+₹{c.cod_charge} COD</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "rateCard" && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Zone-wise Rate Card</h3>
            <p className="text-xs text-text-muted">Rates in ₹ per shipment (excluding GST)</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Zone</th>
                {rateCardData.weightSlabs.map((w) => (
                  <th key={w} className="p-3 text-center font-medium text-text-secondary">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rateCardData.zones.map((z, i) => (
                <tr key={z} className={cn("border-b border-border", i % 2 === 0 && "bg-surface-2/30")}>
                  <td className="p-3 font-medium text-text-primary">Zone {z}</td>
                  {rateCardData.rates[z].map((rate, j) => (
                    <td key={j} className="p-3 text-center text-text-primary">
                      ₹{rate}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "pincheck" && (
        <div className="max-w-lg">
          <div className="rounded-lg bg-card shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Pincode Serviceability Check
            </h3>
            <div className="space-y-3">
              <div>
                <Label>Origin Pincode</Label>
                <Input
                  value={originPin}
                  onChange={(e) => setOriginPin(e.target.value)}
                  placeholder="400001"
                  maxLength={6}
                />
              </div>
              <div>
                <Label>Destination Pincode</Label>
                <div className="flex gap-2">
                  <Input
                    value={pincode}
                    onChange={(e) => { setPincode(e.target.value); setPinCarriers(null); setPinNotServiceable(false); }}
                    placeholder="Enter 6-digit pincode"
                    className="flex-1"
                    maxLength={6}
                    onKeyDown={e => e.key === "Enter" && void checkPin()}
                  />
                  <Button onClick={() => void checkPin()} className="bg-primary text-primary-foreground hover:bg-primary-dark" type="button" disabled={pinLoading}>
                    {pinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    {!pinLoading && "Check"}
                  </Button>
                </div>
              </div>
            </div>

            {pinCarriers && pinCarriers.length > 0 && (
              <div className="mt-4 rounded-lg bg-success-light p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium text-success-dark">
                    Serviceable — {pinCarriers.length} carrier{pinCarriers.length !== 1 ? "s" : ""} available
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {pinCarriers.map((c) => (
                    <div key={c.carrier_id} className="flex items-center justify-between text-sm bg-card rounded px-3 py-1.5">
                      <span className="text-text-primary">{c.carrier_name}</span>
                      <span className="text-text-muted">Zone {c.zone}{c.tat ? ` · ${c.tat}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pinNotServiceable && (
              <div className="mt-4 rounded-lg bg-danger-light p-4 text-center">
                <XCircle className="h-6 w-6 text-danger mx-auto mb-1" />
                <p className="font-medium text-danger-dark">Not serviceable or request failed</p>
                <p className="text-sm text-text-muted mt-1">
                  No couriers returned for {originPin} → {pincode}
                </p>
                {pinError && <p className="text-xs text-danger-dark/90 mt-2">{pinError}</p>}
                <Button variant="outline" size="sm" className="mt-3" type="button" onClick={() => void checkPin()} disabled={pinLoading}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
