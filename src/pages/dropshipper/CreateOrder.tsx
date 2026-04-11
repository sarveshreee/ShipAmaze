import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Truck, Zap, IndianRupee } from "lucide-react";

const couriersResult = [
  { name: "Delhivery", price: 45, days: "2-3 days", badges: ["Cheapest"] },
  { name: "Blue Dart", price: 72, days: "1-2 days", badges: ["Fastest"] },
  { name: "DTDC", price: 52, days: "3-4 days", badges: [] },
  { name: "Ekart", price: 48, days: "2-3 days", badges: [] },
  { name: "XpressBees", price: 50, days: "2-4 days", badges: [] },
];

export default function CreateOrder() {
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [selectedCourier, setSelectedCourier] = useState("");

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Create Order" breadcrumb={["Dropshipper", "Create Order"]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg bg-card shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4">Delivery Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input placeholder="Amit Sharma" /></div>
              <div><Label>Phone *</Label><Input placeholder="+91 98000 00000" /></div>
              <div className="sm:col-span-2"><Label>Address Line 1 *</Label><Input placeholder="House/Flat No, Street" /></div>
              <div className="sm:col-span-2"><Label>Address Line 2</Label><Input placeholder="Landmark" /></div>
              <div><Label>City *</Label><Input placeholder="Mumbai" /></div>
              <div><Label>Pincode *</Label><Input placeholder="400001" /></div>
            </div>
          </div>
          <div className="rounded-lg bg-card shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4">Order Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Order Reference</Label><Input placeholder="REF-001" /></div>
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
              {paymentType === "COD" && <div><Label>COD Amount</Label><Input placeholder="0" type="number" /></div>}
              <div><Label>Product Name *</Label><Input placeholder="Cotton T-Shirt" /></div>
              <div><Label>Quantity *</Label><Input placeholder="1" type="number" /></div>
              <div><Label>Total Weight (kg) *</Label><Input placeholder="0.5" type="number" /></div>
              <div><Label>Invoice Value</Label><Input placeholder="499" type="number" /></div>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg bg-card shadow-card p-5 sticky top-4">
            <h3 className="font-semibold text-text-primary mb-4">Select Courier</h3>
            <div className="space-y-3">
              {couriersResult.map(c => (
                <button key={c.name} onClick={() => setSelectedCourier(c.name)}
                  className={cn("w-full rounded-lg border p-3 text-left transition-colors",
                    selectedCourier === c.name ? "border-primary bg-primary-light" : "border-border hover:border-primary/30"
                  )}>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="font-medium text-text-primary">{c.name}</span>
                    {c.badges.map(b => (
                      <span key={b} className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                        b === "Fastest" ? "bg-secondary-light text-secondary-dark" : "bg-success-light text-success-dark"
                      )}>{b}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-lg font-bold text-primary">₹{c.price}</span>
                    <span className="text-xs text-text-muted">{c.days}</span>
                  </div>
                </button>
              ))}
            </div>
            <Button className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary-dark">Submit & Generate AWB</Button>
            <Button variant="outline" className="w-full mt-2">Save as Draft</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
