import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Truck, Zap, MapPin, Package, Plus, Trash2, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { indianStates } from "@/constants/indianStates";
import { usePickupAddresses } from "@/hooks/useApiData";
import * as orderService from "@/services/orderService";
import type { PickupAddress } from "@/types/logistics";
import { toast } from "sonner";
import { PhoneInput, normalizePhone, validatePhoneLength, getDigitRule } from "@/components/PhoneInput";

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
  const navigate = useNavigate();
  const { data: pickupAddresses = [], isLoading: pickupsLoading } = usePickupAddresses();
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [selectedCourier, setSelectedCourier] = useState("");
  const [selectedPickup, setSelectedPickup] = useState<string>("");
  const [pincode, setPincode] = useState("");
  const [pincodeValid, setPincodeValid] = useState<boolean | null>(null);
  const [products, setProducts] = useState<ProductLine[]>([{ name: "", qty: "1", weight: "0.5", price: "" }]);
  const [showRates, setShowRates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pickupAddresses.length && !selectedPickup) {
      const def = pickupAddresses.find((a) => a.isDefault) || pickupAddresses[0];
      if (def) setSelectedPickup(def.id);
    }
  }, [pickupAddresses, selectedPickup]);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [altPhone, setAltPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [codAmount, setCodAmount] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [dimLength, setDimLength] = useState("");
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");

  const normalizedPhone = normalizePhone(countryCode, phone);
  const normalizedAlt = normalizePhone(countryCode, altPhone);
  const altPhoneDuplicate = altPhone.length > 0 && normalizedAlt === normalizedPhone;
  const phoneError = validatePhoneLength(countryCode, phone);
  const altPhoneError = altPhone.length > 0 ? validatePhoneLength(countryCode, altPhone) : null;
  const altRule = getDigitRule(countryCode);

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

  const generateAWB = () => `AWB${Date.now().toString().slice(-9)}`;

  const totalWeight = products.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
  const totalAmount = parseFloat(invoiceValue) || products.reduce((s, p) => s + (parseFloat(p.price) || 0) * (parseInt(p.qty) || 1), 0);

  const handleSubmit = async () => {
    if (!customerName || !phone || !address1 || !city || !pincode || !selectedCourier) {
      toast.error("Please fill all required fields and select a courier");
      return;
    }
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    if (altPhoneError) {
      toast.error(altPhoneError);
      return;
    }
    if (products.some(p => !p.name)) {
      toast.error("Please fill product names");
      return;
    }
    if (altPhoneDuplicate) {
      toast.error("Alternate number cannot be same as primary number");
      return;
    }

    setSubmitting(true);
    try {
      const awb = generateAWB();
      const dims = dimLength && dimWidth && dimHeight ? `${dimLength}x${dimWidth}x${dimHeight} cm` : "";
      const pickupAddr = pickupAddresses.find((a) => a.id === selectedPickup);
      const fullPhone = `${countryCode}${phone}`;

      const orderData: Record<string, unknown> = {
        ...(orderRef.trim() ? { orderId: orderRef.trim() } : {}),
        customer: customerName,
        phone: fullPhone,
        address: [address1, address2].filter(Boolean).join(", "),
        city,
        pincode,
        weight: `${totalWeight.toFixed(1)} kg`,
        courier: selectedCourier,
        payment: paymentType,
        status: "ready-to-ship",
        date: new Date().toISOString().split("T")[0],
        awb,
        amount: totalAmount,
        products: products.map((p) => ({
          name: p.name,
          qty: parseInt(p.qty) || 1,
          price: parseFloat(p.price) || 0,
          weight: p.weight,
        })),
        dimensions: dims,
        zone: "B",
        pickupAddress: pickupAddr ? pickupAddr.label : "",
      };

      const created = (await orderService.createOrder(orderData)) as { id?: string; orderId?: string };
      const orderId = String(created.id ?? created.orderId ?? orderRef ?? "—");
      toast.success(`Order ${orderId} created!`, { description: `AWB: ${awb} · Status: Ready to Ship` });
      navigate("/dropshipper/orders");
    } catch (err: unknown) {
      toast.error("Failed to create order", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!customerName) {
      toast.error("Please enter at least a customer name");
      return;
    }
    setSubmitting(true);
    try {
      const fullPhone = phone ? `${countryCode}${phone}` : "";
      const orderData: Record<string, unknown> = {
        ...(orderRef.trim() ? { orderId: orderRef.trim() } : {}),
        customer: customerName,
        phone: fullPhone,
        address: [address1, address2].filter(Boolean).join(", "),
        city,
        pincode,
        weight: `${totalWeight.toFixed(1)} kg`,
        courier: selectedCourier || "Delhivery",
        payment: paymentType,
        status: "draft",
        date: new Date().toISOString().split("T")[0],
        awb: "",
        amount: totalAmount,
        products: products.filter((p) => p.name).map((p) => ({
          name: p.name,
          qty: parseInt(p.qty) || 1,
          price: parseFloat(p.price) || 0,
          weight: p.weight,
        })),
      };
      const created = (await orderService.createOrder(orderData)) as { id?: string; orderId?: string };
      const orderId = String(created.id ?? created.orderId ?? "draft");
      toast.success(`Draft ${orderId} saved`);
      navigate("/dropshipper/orders");
    } catch (err: unknown) {
      toast.error("Failed to save draft", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  };

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
            {pickupsLoading && <p className="text-sm text-text-muted">Loading addresses…</p>}
            {!pickupsLoading && pickupAddresses.length === 0 && (
              <p className="text-sm text-text-muted">Add a pickup address in settings first.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pickupAddresses.map((a: PickupAddress) => (
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
              <div><Label>Full Name *</Label><Input placeholder="Amit Sharma" value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
              <div>
                <Label>Phone *</Label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  placeholder="9800000000"
                  error={phone.length > 0 ? phoneError || undefined : undefined}
                />
              </div>
              <div>
                <Label>Alternate Phone</Label>
                <div className="flex">
                  <div className="flex items-center gap-1 px-2.5 border border-r-0 border-border rounded-l-md bg-surface-2 text-sm shrink-0">
                    <span className="text-text-secondary text-xs">{countryCode}</span>
                  </div>
                  <Input
                    placeholder="9800000001"
                    value={altPhone}
                    onChange={e => setAltPhone(e.target.value.replace(/[^0-9]/g, ""))}
                    className={cn("rounded-l-none", (altPhoneDuplicate || altPhoneError) && "border-destructive")}
                    maxLength={altRule.max}
                  />
                </div>
                {altPhoneDuplicate && <p className="text-xs text-destructive mt-1">Alternate number cannot be same as primary number</p>}
                {!altPhoneDuplicate && altPhoneError && <p className="text-xs text-destructive mt-1">{altPhoneError}</p>}
              </div>
              <div className="sm:col-span-2"><Label>Address Line 1 *</Label><Input placeholder="House/Flat No, Street" value={address1} onChange={e => setAddress1(e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Address Line 2</Label><Input placeholder="Landmark, Area" value={address2} onChange={e => setAddress2(e.target.value)} /></div>
              <div><Label>City *</Label><Input placeholder="Mumbai" value={city} onChange={e => setCity(e.target.value)} /></div>
              <div>
                <Label>State *</Label>
                <select value={state} onChange={e => setState(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mt-1">
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
              <div><Label>Order Reference</Label><Input placeholder="REF-001" value={orderRef} onChange={e => setOrderRef(e.target.value)} /></div>
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
              {paymentType === "COD" && <div><Label>COD Amount (₹)</Label><Input placeholder="0" type="number" value={codAmount} onChange={e => setCodAmount(e.target.value)} /></div>}
              <div><Label>Invoice Value (₹)</Label><Input placeholder="499" type="number" value={invoiceValue} onChange={e => setInvoiceValue(e.target.value)} /></div>
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
                <div><Label className="text-xs">Length (cm)</Label><Input placeholder="10" type="number" value={dimLength} onChange={e => setDimLength(e.target.value)} /></div>
                <div><Label className="text-xs">Width (cm)</Label><Input placeholder="8" type="number" value={dimWidth} onChange={e => setDimWidth(e.target.value)} /></div>
                <div><Label className="text-xs">Height (cm)</Label><Input placeholder="5" type="number" value={dimHeight} onChange={e => setDimHeight(e.target.value)} /></div>
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
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary-dark" disabled={!selectedCourier || submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Submit & Generate AWB
              </Button>
              <Button variant="outline" className="w-full" disabled={submitting} onClick={handleSaveDraft}>Save as Draft</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
