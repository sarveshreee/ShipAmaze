import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useState } from "react";

const zones = ["A", "B", "C", "D", "E"];
const weights = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];
const rates = zones.map((z, zi) => weights.map((_, wi) => 30 + zi * 8 + wi * 15));

export default function AdminRates() {
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Rates & Shipping" breadcrumb={["Admin", "Rates"]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg bg-card shadow-card p-6">
          <h3 className="font-semibold text-text-primary mb-4">Rate Calculator</h3>
          <div className="space-y-3">
            <div><Label>Origin Pincode</Label><Input placeholder="400001" /></div>
            <div><Label>Destination Pincode</Label><Input placeholder="110001" /></div>
            <div><Label>Weight (kg)</Label><Input placeholder="0.5" type="number" /></div>
            <div>
              <Label>Payment Type</Label>
              <div className="flex gap-2 mt-1">
                {(["Prepaid", "COD"] as const).map(t => (
                  <button key={t} onClick={() => setPaymentType(t)}
                    className={cn("flex-1 rounded-lg py-2 text-sm font-medium border transition-colors",
                      paymentType === t ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 text-text-secondary border-transparent"
                    )}>{t}</button>
                ))}
              </div>
            </div>
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">Calculate Rates</Button>
          </div>
        </div>

        <div className="rounded-lg bg-card shadow-card p-6">
          <h3 className="font-semibold text-text-primary mb-4">Rate Card</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="p-2 text-left font-medium text-text-secondary">Zone</th>
                {weights.map(w => <th key={w} className="p-2 text-center font-medium text-text-secondary">{w}</th>)}
              </tr></thead>
              <tbody>
                {zones.map((z, zi) => (
                  <tr key={z} className="border-b border-border last:border-0">
                    <td className="p-2 font-semibold text-primary">Zone {z}</td>
                    {rates[zi].map((r, wi) => (
                      <td key={wi} className="p-2 text-center text-text-primary">₹{r}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" className="mt-4">Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
