import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MapPin, User, Truck, Package, Box, ChevronRight, ChevronLeft, Plus, Phone, Save } from "lucide-react";
import { pickupAddresses as defaultPickupAddresses, orders as globalOrders } from "@/data/mockData";
import { AddAddressModal } from "@/components/AddAddressModal";
import { toast } from "sonner";

const steps = [
  { num: 1, label: "Pickup Address", icon: MapPin },
  { num: 2, label: "Consignee Details", icon: User },
  { num: 3, label: "Shipment Details", icon: Truck },
  { num: 4, label: "Package Details", icon: Package },
  { num: 5, label: "Courier", icon: Box },
];

interface StepErrors {
  [key: string]: string;
}

const generateOrderId = () => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}${rand}`.toUpperCase().slice(0, 16);
};

const mockCouriers = [
  { id: "ekart", name: "Ekart-Px", slab: "1 Kg", edd: "17-Apr-2026", amount: 90.01 },
  { id: "xpressbees", name: "XPress Bees", slab: "0.50 Kg", edd: "17-Apr-2026", amount: 132.02 },
  { id: "delhivery", name: "Delhivery", slab: "1 Kg", edd: "17-Apr-2026", amount: 105.01 },
  { id: "amazon", name: "Amazon", slab: "1 Kg", edd: "17-Apr-2026", amount: 90.01 },
  { id: "xbs", name: "XBS SO PX", slab: "1 Kg", edd: "17-Apr-2026", amount: 90.01 },
  { id: "ekartb2b", name: "Ekart B2B", slab: "10 Kg", edd: "17-Apr-2026", amount: 401.2 },
];

interface SavedOrder {
  id: string;
  orderId: string;
  consigneeName: string;
  pickupLabel: string;
  dateSaved: string;
  data: any;
}

export default function AddOrder() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const [extraAddresses, setExtraAddresses] = useState<typeof defaultPickupAddresses>([]);
  const allAddresses = [...defaultPickupAddresses, ...extraAddresses];

  // Fix 4: Start empty
  const [selectedPickup, setSelectedPickup] = useState("");
  const [showReturn, setShowReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState("");

  // Step 2
  const [consignee, setConsignee] = useState({ fullName: "", phone: "", email: "", altPhone: "" });

  // Step 3 - auto-generate order ID
  const [shipment, setShipment] = useState({ orderId: generateOrderId(), paymentType: "Prepaid", invoiceValue: "", codAmount: "" });
  const [products, setProducts] = useState([{ name: "", qty: "", weight: "", price: "" }]);

  // Step 4
  const [pkg, setPkg] = useState({ weight: "", length: "", width: "", height: "" });

  // Step 5
  const [courierMode, setCourierMode] = useState<"priority" | "courier">("priority");
  const [expressType, setExpressType] = useState("Surface");
  const [prioritySelections, setPrioritySelections] = useState<string[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");

  // Saved orders
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>(() => {
    try { return JSON.parse(localStorage.getItem("savedOrders") || "[]"); } catch { return []; }
  });

  // Validation
  const [stepErrors, setStepErrors] = useState<StepErrors>({});

  const selectedPickupAddr = allAddresses.find(a => a.id === selectedPickup);
  const selectedReturnAddr = allAddresses.find(a => a.id === selectedReturn);

  // Regenerate order ID when step 3 is loaded
  useEffect(() => {
    if (currentStep === 3 && !shipment.orderId) {
      setShipment(p => ({ ...p, orderId: generateOrderId() }));
    }
  }, [currentStep]);

  const validateStep = useCallback((step: number): boolean => {
    const errors: StepErrors = {};
    if (step === 1) {
      if (!selectedPickup) errors.pickup = "Please select a pickup address to continue";
      if (showReturn && !selectedReturn) errors.return = "Please select a return address to continue";
    } else if (step === 2) {
      if (!consignee.fullName.trim()) errors.fullName = "Full name is required";
      if (!consignee.phone.trim() || consignee.phone.length !== 10) errors.phone = "Valid 10-digit phone is required";
    } else if (step === 3) {
      if (!shipment.invoiceValue.trim()) errors.invoiceValue = "Invoice value is required";
      if (shipment.paymentType === "COD" && !shipment.codAmount.trim()) errors.codAmount = "COD amount is required";
    } else if (step === 4) {
      if (!pkg.weight.trim()) errors.weight = "Weight is required";
      if (!pkg.length.trim() || !pkg.width.trim() || !pkg.height.trim()) errors.dimensions = "All dimensions are required";
    } else if (step === 5) {
      if (courierMode === "priority" && prioritySelections.length === 0) errors.courier = "Select at least one courier priority";
      if (courierMode === "courier" && !selectedCourier) errors.courier = "Select a courier";
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedPickup, showReturn, selectedReturn, consignee, shipment, pkg, courierMode, prioritySelections, selectedCourier]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(s => s + 1);
    }
  };

  // Fix 3: Completely disable step click navigation
  const handleStepClick = (_stepNum: number) => {
    // Steps only navigable via Next/Previous buttons
  };

  const handleAddAddress = (addr: any) => {
    const newAddr = {
      id: `custom-${Date.now()}`,
      label: addr.label,
      contactName: addr.contactName,
      phone: addr.phone,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: false,
    };
    setExtraAddresses(prev => [...prev, newAddr]);
    setSelectedPickup(newAddr.id);
  };

  const handlePriorityClick = (courierId: string) => {
    setPrioritySelections(prev => {
      if (prev.includes(courierId)) return prev.filter(c => c !== courierId);
      if (prev.length >= 3) return prev;
      return [...prev, courierId];
    });
  };

  const handleSaveOrder = () => {
    const pickupAddr = allAddresses.find(a => a.id === selectedPickup);
    const saved: SavedOrder = {
      id: `saved-${Date.now()}`,
      orderId: shipment.orderId,
      consigneeName: consignee.fullName || "Unnamed",
      pickupLabel: pickupAddr?.label || "N/A",
      dateSaved: new Date().toLocaleString(),
      data: { selectedPickup, showReturn, selectedReturn, consignee, shipment, products, pkg, courierMode, expressType, prioritySelections, selectedCourier },
    };
    const updated = [...savedOrders, saved];
    setSavedOrders(updated);
    localStorage.setItem("savedOrders", JSON.stringify(updated));
    toast.success("Order saved successfully");
  };

  const loadSavedOrder = (saved: SavedOrder) => {
    const d = saved.data;
    setSelectedPickup(d.selectedPickup);
    setShowReturn(d.showReturn);
    setSelectedReturn(d.selectedReturn);
    setConsignee(d.consignee);
    setShipment({ ...d.shipment, orderId: generateOrderId() }); // new ID
    setProducts(d.products);
    setPkg(d.pkg);
    setCourierMode(d.courierMode);
    setExpressType(d.expressType);
    setPrioritySelections(d.prioritySelections);
    setSelectedCourier(d.selectedCourier);
    setCurrentStep(1);
    toast.success("Saved order loaded — Order ID regenerated");
  };

  const handleSubmitOrder = () => {
    if (!validateStep(5)) return;

    const pickupAddr = allAddresses.find(a => a.id === selectedPickup);
    const courierName = courierMode === "courier"
      ? mockCouriers.find(c => c.id === selectedCourier)?.name || "N/A"
      : prioritySelections.map(id => mockCouriers.find(c => c.id === id)?.name).filter(Boolean).join(", ");

    const newOrder = {
      id: shipment.orderId,
      customer: consignee.fullName,
      phone: `+91 ${consignee.phone}`,
      address: pickupAddr?.addressLine1 || "",
      city: pickupAddr?.city || "",
      pincode: pickupAddr?.pincode || "",
      weight: `${pkg.weight} kg`,
      courier: courierName as any,
      payment: shipment.paymentType as any,
      status: "pending" as any,
      date: new Date().toISOString().split("T")[0],
      awb: `AWB${Date.now().toString().slice(-9)}`,
      amount: Number(shipment.invoiceValue) || 0,
      products: products.filter(p => p.name).map(p => ({ name: p.name, qty: Number(p.qty) || 1, price: Number(p.price) || 0, weight: p.weight || "0.5 kg" })),
      dimensions: `${pkg.length}x${pkg.width}x${pkg.height} cm`,
      pickupAddress: pickupAddr?.label,
    };

    globalOrders.unshift(newOrder);
    toast.success("Order submitted successfully!");
    navigate("/dropshipper/orders");
  };

  const canNext = currentStep < 5;
  const canPrev = currentStep > 1;

  return (
    <div className="animate-fade-in-up">
      {/* Fix 2: Removed Add Warehouse button */}
      <PageHeader title="Add Order" breadcrumb={["Dropshipper", "Add Order"]} />

      <div className="flex gap-6">
        {/* Left stepper - Fix 3: no click navigation */}
        <div className="hidden md:flex flex-col gap-1 w-52 shrink-0">
          {steps.map((s) => {
            const active = currentStep === s.num;
            const done = currentStep > s.num;
            return (
              <div key={s.num}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm transition-colors cursor-default",
                  active ? "bg-primary-light text-primary font-medium" : done ? "text-success" : "text-text-secondary opacity-50"
                )}>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-xs font-bold",
                  active ? "bg-primary text-primary-foreground" : done ? "bg-success text-white" : "bg-surface-2 text-text-muted"
                )}>
                  {done ? "✓" : s.num}
                </div>
                <div>
                  <p className="text-xs text-text-muted">Step {s.num}</p>
                  <p className="font-medium">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {currentStep === 1 && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 space-y-5">
                <div>
                  <Label className="text-sm font-medium">Select Pickup Address<span className="text-danger">*</span></Label>
                  <select value={selectedPickup} onChange={e => setSelectedPickup(e.target.value)}
                    className={cn("mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                      stepErrors.pickup ? "border-danger" : "border-border"
                    )}>
                    <option value="">-- Select Pickup Address --</option>
                    {allAddresses.map(a => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                  {stepErrors.pickup && <p className="text-xs text-danger mt-1">{stepErrors.pickup}</p>}
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={showReturn} onCheckedChange={setShowReturn} />
                  <Label className="text-sm cursor-pointer" onClick={() => setShowReturn(!showReturn)}>Return Address (if any)</Label>
                </div>

                {showReturn && (
                  <div>
                    <Label className="text-sm font-medium">Select Return Address<span className="text-danger">*</span></Label>
                    <select value={selectedReturn} onChange={e => setSelectedReturn(e.target.value)}
                      className={cn("mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                        stepErrors.return ? "border-danger" : "border-border"
                      )}>
                      <option value="">-- Select Return Address --</option>
                      {allAddresses.map(a => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    {stepErrors.return && <p className="text-xs text-danger mt-1">{stepErrors.return}</p>}
                  </div>
                )}

                <Button variant="outline" className="gap-2 text-sm" onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4" /> Add Address
                </Button>
              </div>

              <div className="w-full lg:w-80 space-y-4">
                {selectedPickupAddr && (
                  <div className="rounded-lg border border-border bg-card p-5 relative">
                    <div className="absolute top-4 right-4">
                      <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-text-primary mb-3">Pickup Address</h4>
                    <p className="text-sm text-text-secondary font-medium">{selectedPickupAddr.label}</p>
                    <p className="text-sm text-primary font-medium mt-1">{selectedPickupAddr.contactName}</p>
                    <p className="text-sm text-text-secondary mt-1">{selectedPickupAddr.addressLine1}</p>
                    <p className="text-sm text-text-secondary">{selectedPickupAddr.addressLine2}</p>
                    <p className="text-sm text-text-secondary">{selectedPickupAddr.city}, {selectedPickupAddr.state}, {selectedPickupAddr.pincode}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-text-secondary">
                      <Phone className="h-3.5 w-3.5" />{selectedPickupAddr.phone}
                    </div>
                  </div>
                )}

                {showReturn && selectedReturnAddr && (
                  <div className="rounded-lg border border-border bg-card p-5 relative">
                    <div className="absolute top-4 right-4">
                      <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-text-primary mb-3">Return Address</h4>
                    <p className="text-sm text-text-secondary font-medium">{selectedReturnAddr.label}</p>
                    <p className="text-sm text-primary font-medium mt-1">{selectedReturnAddr.contactName}</p>
                    <p className="text-sm text-text-secondary mt-1">{selectedReturnAddr.addressLine1}</p>
                    <p className="text-sm text-text-secondary">{selectedReturnAddr.addressLine2}</p>
                    <p className="text-sm text-text-secondary">{selectedReturnAddr.city}, {selectedReturnAddr.state}, {selectedReturnAddr.pincode}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-text-secondary">
                      <Phone className="h-3.5 w-3.5" />{selectedReturnAddr.phone}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2 - Consignee Details */}
          {currentStep === 2 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Consignee Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Full Name<span className="text-danger">*</span></Label>
                  <Input value={consignee.fullName} onChange={e => setConsignee(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Customer name" className={stepErrors.fullName ? "border-danger" : ""} />
                  {stepErrors.fullName && <p className="text-xs text-danger mt-1">{stepErrors.fullName}</p>}
                </div>
                <div>
                  <Label>Phone<span className="text-danger">*</span></Label>
                  <div className="flex mt-1">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-surface-2 text-sm text-text-muted">+91</span>
                    <Input value={consignee.phone}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setConsignee(p => ({ ...p, phone: val }));
                      }}
                      placeholder="98000 00000" className={cn("rounded-l-none", stepErrors.phone ? "border-danger" : "")}
                      maxLength={10} />
                  </div>
                  {stepErrors.phone && <p className="text-xs text-danger mt-1">{stepErrors.phone}</p>}
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="flex mt-1">
                    <Input value={consignee.email}
                      onChange={e => setConsignee(p => ({ ...p, email: e.target.value.replace(/@.*$/, "") }))}
                      placeholder="username" className="rounded-r-none" />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-border bg-surface-2 text-sm text-text-muted whitespace-nowrap">@gmail.com</span>
                  </div>
                </div>
                <div>
                  <Label>Alt Phone <span className="text-text-muted text-xs">(Optional, but useful in emergency)</span></Label>
                  <div className="flex mt-1">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-surface-2 text-sm text-text-muted">+91</span>
                    <Input value={consignee.altPhone}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setConsignee(p => ({ ...p, altPhone: val }));
                      }}
                      placeholder="Alternate number" className="rounded-l-none" maxLength={10} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 - Shipment Details */}
          {currentStep === 3 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Shipment Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Order ID</Label>
                  <Input value={shipment.orderId} readOnly className="bg-surface-2 text-text-muted cursor-not-allowed" />
                </div>
                <div>
                  <Label>Payment Type<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    {["Prepaid", "COD"].map(t => (
                      <button key={t} onClick={() => setShipment(p => ({ ...p, paymentType: t, codAmount: t === "Prepaid" ? "" : p.codAmount }))}
                        className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all",
                          shipment.paymentType === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-text-secondary hover:border-primary/50"
                        )}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Invoice Value<span className="text-danger">*</span></Label>
                  <Input value={shipment.invoiceValue} onChange={e => setShipment(p => ({ ...p, invoiceValue: e.target.value }))}
                    placeholder="₹0.00" type="number" className={stepErrors.invoiceValue ? "border-danger" : ""} />
                  {stepErrors.invoiceValue && <p className="text-xs text-danger mt-1">{stepErrors.invoiceValue}</p>}
                </div>
                {shipment.paymentType === "COD" && (
                  <div>
                    <Label>COD Amount<span className="text-danger">*</span></Label>
                    <Input value={shipment.codAmount} onChange={e => setShipment(p => ({ ...p, codAmount: e.target.value }))}
                      placeholder="₹0.00" type="number" className={stepErrors.codAmount ? "border-danger" : ""} />
                    {stepErrors.codAmount && <p className="text-xs text-danger mt-1">{stepErrors.codAmount}</p>}
                  </div>
                )}
              </div>
              <h4 className="font-medium text-text-primary pt-2">Products</h4>
              {products.map((prod, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div><Label>Product Name</Label><Input value={prod.name} onChange={e => { const np = [...products]; np[i].name = e.target.value; setProducts(np); }} placeholder="Item name" /></div>
                  <div><Label>Qty</Label><Input value={prod.qty} onChange={e => { const np = [...products]; np[i].qty = e.target.value; setProducts(np); }} placeholder="1" type="number" /></div>
                  <div><Label>Weight (kg)</Label><Input value={prod.weight} onChange={e => { const np = [...products]; np[i].weight = e.target.value; setProducts(np); }} placeholder="0.5" type="number" /></div>
                  <div><Label>Price (₹)</Label><Input value={prod.price} onChange={e => { const np = [...products]; np[i].price = e.target.value; setProducts(np); }} placeholder="0" type="number" /></div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setProducts(p => [...p, { name: "", qty: "", weight: "", price: "" }])}>
                <Plus className="h-3.5 w-3.5" />Add Product
              </Button>
            </div>
          )}

          {/* Step 4 - Package Details */}
          {currentStep === 4 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Package Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Actual Weight<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={pkg.weight} onChange={e => setPkg(p => ({ ...p, weight: e.target.value }))}
                      placeholder="Enter weight..." type="number" className={cn("flex-1", stepErrors.weight ? "border-danger" : "")} />
                    <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">KG</span>
                  </div>
                  {stepErrors.weight && <p className="text-xs text-danger mt-1">{stepErrors.weight}</p>}
                </div>
                <div>
                  <Label>Dimensions<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1 items-center">
                    <Input value={pkg.length} onChange={e => setPkg(p => ({ ...p, length: e.target.value }))}
                      placeholder="Length" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                    <span className="text-text-muted">×</span>
                    <Input value={pkg.width} onChange={e => setPkg(p => ({ ...p, width: e.target.value }))}
                      placeholder="Width" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                    <span className="text-text-muted">×</span>
                    <Input value={pkg.height} onChange={e => setPkg(p => ({ ...p, height: e.target.value }))}
                      placeholder="Height" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                    <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">cm</span>
                  </div>
                  {stepErrors.dimensions && <p className="text-xs text-danger mt-1">{stepErrors.dimensions}</p>}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Weight Presets</Label>
                <div className="flex flex-wrap gap-3">
                  {["0.5 KG", "1 KG", "2 KG", "5 KG", "Other"].map(w => (
                    <label key={w} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="weight-preset" className="accent-primary" defaultChecked={w === "Other"}
                        onChange={() => { if (w !== "Other") setPkg(p => ({ ...p, weight: w.replace(" KG", "") })); }} />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5 - Courier */}
          {currentStep === 5 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h3 className="font-semibold text-text-primary">Choose Courier</h3>

              <div>
                <Label className="mb-2 block">Selection Mode<span className="text-danger">*</span></Label>
                <div className="flex gap-4">
                  {([["priority", "Priority Selection"], ["courier", "Courier Selection"]] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="courier-mode" className="accent-primary"
                        checked={courierMode === val} onChange={() => { setCourierMode(val); setPrioritySelections([]); setSelectedCourier(""); }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {courierMode === "priority" && (
                <>
                  <div>
                    <Label>Express<span className="text-danger">*</span></Label>
                    <select value={expressType} onChange={e => setExpressType(e.target.value)}
                      className="mt-1 w-48 rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                      <option>Surface</option><option>Express</option>
                    </select>
                  </div>
                  <p className="text-sm text-text-muted">Click cards to set priority (1st, 2nd, 3rd). Click again to deselect.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {mockCouriers.slice(0, 3).map(c => {
                      const idx = prioritySelections.indexOf(c.id);
                      const isSelected = idx !== -1;
                      return (
                        <button key={c.id} onClick={() => handlePriorityClick(c.id)}
                          className={cn("rounded-xl border-2 p-5 text-center transition-all hover:shadow-md",
                            isSelected ? "border-primary bg-primary-light" : "border-border hover:border-primary/40"
                          )}>
                          {isSelected && (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold mb-2">
                              {idx + 1}
                            </span>
                          )}
                          <p className="font-bold text-text-primary text-base">{c.name}</p>
                          <p className="text-xs text-text-muted mt-1">Slab: {c.slab}</p>
                          <p className="text-xs text-text-muted">EDD: {c.edd}</p>
                          <p className="text-sm font-semibold text-primary mt-2">₹{c.amount}</p>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {courierMode === "courier" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mockCouriers.map(c => (
                    <button key={c.id} onClick={() => setSelectedCourier(c.id)}
                      className={cn("rounded-xl border-2 p-5 text-center transition-all hover:shadow-md",
                        selectedCourier === c.id ? "border-primary bg-primary-light" : "border-border hover:border-primary/40"
                      )}>
                      <p className="font-bold text-text-primary text-base">{c.name}</p>
                      <p className="text-xs text-text-muted mt-1">Slab: {c.slab}</p>
                      <p className="text-xs text-text-muted">EDD: {c.edd}</p>
                      <p className="text-sm font-semibold text-primary mt-2">₹{c.amount}</p>
                    </button>
                  ))}
                </div>
              )}

              {stepErrors.courier && <p className="text-xs text-danger mt-1">{stepErrors.courier}</p>}

              {/* Saved Orders */}
              {savedOrders.length > 0 && (
                <div className="mt-6 border-t border-border pt-4">
                  <h4 className="font-medium text-text-primary mb-2">Saved Orders</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {savedOrders.map(s => (
                      <button key={s.id} onClick={() => loadSavedOrder(s)}
                        className="w-full text-left rounded-lg border border-border p-3 hover:bg-surface-2/50 transition-colors text-sm flex justify-between items-center">
                        <div>
                          <span className="font-mono text-primary font-medium">{s.orderId}</span>
                          <span className="mx-2 text-text-muted">•</span>
                          <span className="text-text-secondary">{s.consigneeName}</span>
                          <span className="mx-2 text-text-muted">•</span>
                          <span className="text-text-muted">{s.pickupLabel}</span>
                        </div>
                        <span className="text-xs text-text-muted">{s.dateSaved}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-end gap-3 mt-6">
            {canPrev && (
              <Button variant="outline" onClick={() => { setStepErrors({}); setCurrentStep(s => s - 1); }} className="gap-2">
                <ChevronLeft className="h-4 w-4" />Previous
              </Button>
            )}
            {canNext ? (
              <Button onClick={handleNext} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
                Next<ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleSaveOrder} className="gap-2">
                  <Save className="h-4 w-4" />Save Order
                </Button>
                <Button className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2" onClick={handleSubmitOrder}>
                  Submit Order
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <AddAddressModal open={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleAddAddress} />
    </div>
  );
}
