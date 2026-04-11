import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Truck, Zap, IndianRupee, MapPin, Package, Plus, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { pickupAddresses, indianStates } from "@/data/mockData";

const couriersResult = [
  { name: "Delhivery", price: 45, days: "2-3 days", badges: ["Cheapest"], mode: "Surface", rating: 4.2 },
  { name: "Blue Dart", price: 72, days: "1-2 days", badges: ["Fastest"], mode: "Air", rating: 4.5 },
  { name: "DTDC", price: 52, days: "3-4 days", badges: [], mode: "Surface", rating: 3.8 },
  { name: "Ekart", price: 48, days: "2-3 days", badges: [], mode: "Surface", rating: 4.0 },
  { name: "XpressBees", price: 50, days: "2-4 days", badges: ["Best Rating"], mode: "Surface", rating: 4.3 },
];

interface ProductLine {
  name: string; qty: string; weight: string; price: string;
}

export default function CreateOrder() {
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [selectedCourier, setSelectedCourier] = useState("");
  const [selectedPickup, setSelectedPickup] = useState(pickupAddresses[0].id);
  const [pincode, setPincode] = useState("");
  const [pincodeValid, setPincodeValid] = useState<boolean | null>(null);
  const [products, setProducts] = useState<ProductLine[]>([{ name: "", qty: "1", weight: "0.5", price: "" }]);
  const [showRates, setShowRates] = useState(false);

  const checkPincode = (val: string) => {
    setPincode(val);
    if (val.length === 6) {
      setPincodeValid(!['999999', '000000'].includes(val));
      setShowRates(true);
    } else {
      setPincodeValid(null);
      setShowRates(false);
    }
  };

  const addProduct = () => setProducts([...products, { name: "", qty: "1", weight: "0.2", price: "" }]);
  const removeProduct = (i: number) => setProducts(products.filter((_, idx) => idx !== i));

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Create Order" breadcrumb={["Dropshipper", "Create Order"]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Pickup Address */}
          <div className="rounded-lg bg-card shadow-card p-5">
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />Pickup Address
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pickupAddresses.map(a => (
                <button key={a.id} onClick={() => setSelectedPickup(a.id)}
                  className={cn("rounded-lg border-2 p-3 text-left transition-all text-sm",
                    selectedPickup === a.id ? "border-primary bg-primary-light" : "border-border hover:border-primary/30"
                  )}>
                  <p className="font-medium text-text-primary">{a.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{a.city}, {a.pincode}</p>
                  {a.isDefault && <span className="text-[10px] text-primary font-medium">Default</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Address */}
          <div className="rounded-lg bg-card shadow-card p-5">
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />Delivery Address
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input placeholder="Amit Sharma" /></div>
              <div><Label>Phone *</Label><Input placeholder="+91 98000 00000" /></div>
              <div><Label>Alternate Phone</Label><Input placeholder="+91 98000 00001" /></div>
              <div className="sm:col-span-2"><Label>Address Line 1 *</Label><Input placeholder="House/Flat No, Street" /></div>
              <div className="sm:col-span-2"><Label>Address Line 2</Label><Input placeholder="Landmark, Area" /></div>
              <div><Label>City *</Label><Input placeholder="Mumbai" /></div>
              <div>
                <Label>State *</Label>
                <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mt-1">
                  <option value="">Select State</option>
                  {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Pincode *</Label>
                <div className="relative">
                  <Input value={pincode} onChange={e => checkPincode(e.target.value)} placeholder="400001" className="pr-8" maxLength={6} />
                  {pincodeValid === true && <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
                  {pincodeValid === false && <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-danger" />}
                </div>
                {pincodeValid === false && <p className="text-xs text-danger mt-1">This pincode is not serviceable</p>}
                {pincodeValid === true && <p className="text-xs text-success mt-1">Serviceable · Zone B</p>}
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="rounded-lg bg-card shadow-card p-5">
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />Order Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div><Label>Order Reference</Label><Input placeholder="REF-001" /></div>
              <div>
                <Label>Payment Type</Label>
                <div className="flex gap-2 mt-1">
                  {(["Prepaid", "COD"] as const).map(t => (
                    <button key={t} onClick={() => setPaymentType(t)}
                      className={cn("flex-1 rounded-lg py-2.5 text-sm font-medium border-2 transition-all",
                        paymentType === t ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 text-text-secondary border-transparent hover:border-border"
                      )}>{t}</button>
                  ))}
                </div>
              </div>
              {paymentType === "COD" && <div><Label>COD Amount (₹)</Label><Input placeholder="0" type="number" /></div>}
              <div><Label>Invoice Value (₹)</Label><Input placeholder="499" type="number" /></div>
            </div>

            {/* Multi-product */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Products</Label>
                <Button size="sm" variant="outline" onClick={addProduct} className="text-xs h-7">
                  <Plus className="h-3 w-3 mr-1" />Add Product
                </Button>
              </div>
              {products.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_100px_32px] gap-2 mb-2 items-end">
                  <div><Label className="text-xs">Name *</Label><Input placeholder="Product name" value={p.name} onChange={e => { const np = [...products]; np[i].name = e.target.value; setProducts(np); }} /></div>
                  <div><Label className="text-xs">Qty</Label><Input type="number" value={p.qty} onChange={e => { const np = [...products]; np[i].qty = e.target.value; setProducts(np); }} /></div>
                  <div><Label className="text-xs">Wt (kg)</Label><Input type="number" value={p.weight} onChange={e => { const np = [...products]; np[i].weight = e.target.value; setProducts(np); }} /></div>
                  <div><Label className="text-xs">Price (₹)</Label><Input type="number" value={p.price} onChange={e => { const np = [...products]; np[i].price = e.target.value; setProducts(np); }} /></div>
                  {products.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeProduct(i)} className="h-9 w-9 p-0 text-danger hover:bg-danger-light">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Dimensions */}
            <div className="border-t border-border pt-4 mt-4">
              <Label className="text-sm font-semibold mb-2 block">Package Dimensions (optional)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Length (cm)</Label><Input placeholder="10" type="number" /></div>
                <div><Label className="text-xs">Width (cm)</Label><Input placeholder="8" type="number" /></div>
                <div><Label className="text-xs">Height (cm)</Label><Input placeholder="5" type="number" /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Courier Selection */}
        <div>
          <div className="rounded-lg bg-card shadow-card p-5 sticky top-4">
            <h3 className="font-semibold text-text-primary mb-1">Select Courier</h3>
            <p className="text-xs text-text-muted mb-4">Rates based on weight & destination</p>

            {!showRates ? (
              <div className="text-center py-8 text-text-muted">
                <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Enter delivery pincode to see courier rates</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {couriersResult.map(c => (
                  <button key={c.name} onClick={() => setSelectedCourier(c.name)}
                    className={cn("w-full rounded-xl border-2 p-3 text-left transition-all",
                      selectedCourier === c.name ? "border-primary bg-primary-light shadow-sm" : "border-border hover:border-primary/30"
                    )}>
                    <div className="flex items-center gap-2 mb-1">
                      <Truck className="h-4 w-4 text-primary" />
                      <span className="font-medium text-text-primary text-sm">{c.name}</span>
                      {c.badges.map(b => (
                        <span key={b} className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                          b === "Fastest" ? "bg-secondary-light text-secondary-dark" :
                          b === "Cheapest" ? "bg-success-light text-success-dark" :
                          "bg-tertiary-light text-tertiary-dark"
                        )}>{b}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">₹{c.price}</span>
                      <div className="text-right">
                        <span className="text-xs text-text-muted flex items-center gap-1"><Clock className="h-3 w-3" />{c.days}</span>
                        <span className="text-[10px] text-text-muted">{c.mode} · ⭐ {c.rating}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-border mt-4 pt-4 space-y-2">
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary-dark" disabled={!selectedCourier}>
                <Zap className="h-4 w-4 mr-2" />Submit & Generate AWB
              </Button>
              <Button variant="outline" className="w-full">Save as Draft</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
