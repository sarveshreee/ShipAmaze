import { useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { rateCardData } from "@/constants/rateCard";
import { usePincodes } from "@/hooks/useApiData";
import type { PincodeService } from "@/types/logistics";
import { cn } from "@/lib/utils";
import { Calculator, MapPin, Truck, CheckCircle2, XCircle, Search } from "lucide-react";

const couriersResult = [
  { name: "Delhivery", mode: "Surface", weight: "0.5 kg", zone: "B", rate: 35, delivery: "2-3 days" },
  { name: "Blue Dart", mode: "Air", weight: "0.5 kg", zone: "B", rate: 65, delivery: "1-2 days" },
  { name: "DTDC", mode: "Surface", weight: "0.5 kg", zone: "B", rate: 42, delivery: "3-4 days" },
  { name: "Ekart", mode: "Surface", weight: "0.5 kg", zone: "B", rate: 38, delivery: "2-3 days" },
  { name: "XpressBees", mode: "Surface", weight: "0.5 kg", zone: "B", rate: 40, delivery: "2-4 days" },
];

export default function DropshipperRates() {
  const [tab, setTab] = useState<"calculator" | "rateCard" | "pincheck">("calculator");
  const [showResults, setShowResults] = useState(false);
  const [pincode, setPincode] = useState("");
  const [pinResult, setPinResult] = useState<PincodeService | null>(null);
  const { data: pincodes = [] } = usePincodes();

  const byPin = useMemo(() => {
    const m = new Map<string, PincodeService>();
    for (const p of pincodes) m.set(p.pincode, p as PincodeService);
    return m;
  }, [pincodes]);

  const checkPin = () => {
    setPinResult(byPin.get(pincode) || null);
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
                <Input placeholder="400001" />
              </div>
              <div>
                <Label>Destination Pincode</Label>
                <Input placeholder="110001" />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input placeholder="0.5" type="number" />
              </div>
              <div>
                <Label>Payment Type</Label>
                <div className="flex gap-2 mt-1">
                  {["Prepaid", "COD"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium border-2 transition-all",
                        t === "Prepaid" ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => setShowResults(true)}
                className="w-full bg-primary text-primary-foreground hover:bg-primary-dark"
                type="button"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Calculate Rates
              </Button>
            </div>
          </div>

          {showResults && (
            <div className="rounded-lg bg-card shadow-card overflow-hidden">
              <div className="p-4 border-b border-border bg-surface-2/50">
                <h3 className="font-semibold text-text-primary">Available Couriers</h3>
                <p className="text-xs text-text-muted">Zone B · 0.5 kg · Prepaid</p>
              </div>
              <div className="divide-y divide-border">
                {couriersResult.map((c) => (
                  <div key={c.name} className="p-4 flex items-center gap-4 hover:bg-surface-2/30 transition-colors">
                    <Truck className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-text-primary">{c.name}</p>
                      <p className="text-xs text-text-muted">
                        {c.mode} · {c.delivery}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">₹{c.rate}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-8" type="button">
                      Select
                    </Button>
                  </div>
                ))}
              </div>
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
            <div className="flex gap-2">
              <Input
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="Enter 6-digit pincode"
                className="flex-1"
                maxLength={6}
              />
              <Button onClick={checkPin} className="bg-primary text-primary-foreground hover:bg-primary-dark" type="button">
                <Search className="h-4 w-4 mr-2" />
                Check
              </Button>
            </div>

            {pinResult && (
              <div className="mt-4 rounded-lg bg-success-light p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium text-success-dark">
                    Serviceable — {pinResult.city}, {pinResult.state}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  Zone {pinResult.zone} · {pinResult.couriers.length} couriers available
                </p>
                <div className="mt-3 space-y-1">
                  {pinResult.couriers.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-sm bg-card rounded px-3 py-1.5">
                      <span className="text-text-primary">{c.name}</span>
                      <span className="text-text-muted">{c.estimatedDays}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pincode.length === 6 && !pinResult && (
              <div className="mt-4 rounded-lg bg-danger-light p-4 text-center">
                <XCircle className="h-6 w-6 text-danger mx-auto mb-1" />
                <p className="font-medium text-danger-dark">Not Serviceable</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
