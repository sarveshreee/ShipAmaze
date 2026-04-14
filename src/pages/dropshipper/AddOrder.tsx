import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MapPin, User, Truck, Package, Box, ChevronRight, ChevronLeft, Plus, Phone } from "lucide-react";
import { pickupAddresses as defaultPickupAddresses } from "@/data/mockData";
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

export default function AddOrder() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  // Pickup addresses (local + mock)
  const [extraAddresses, setExtraAddresses] = useState<typeof defaultPickupAddresses>([]);
  const allAddresses = [...defaultPickupAddresses, ...extraAddresses];

  const [selectedPickup, setSelectedPickup] = useState(allAddresses[0]?.id || "");
  const [showReturn, setShowReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(allAddresses[0]?.id || "");

  // Step 2 fields
  const [consignee, setConsignee] = useState({ fullName: "", phone: "", email: "", altPhone: "" });

  // Step 3 fields
  const [shipment, setShipment] = useState({ orderRef: "", paymentType: "Prepaid", invoiceValue: "", codAmount: "" });
  const [products, setProducts] = useState([{ name: "", qty: "", weight: "", price: "" }]);

  // Step 4 fields
  const [pkg, setPkg] = useState({ weight: "", length: "", width: "", height: "" });

  // Validation
  const [stepErrors, setStepErrors] = useState<StepErrors>({});
  const [highestValidStep, setHighestValidStep] = useState(1);

  const selectedPickupAddr = allAddresses.find(a => a.id === selectedPickup);
  const selectedReturnAddr = allAddresses.find(a => a.id === selectedReturn);

  const validateStep = useCallback((step: number): boolean => {
    const errors: StepErrors = {};
    if (step === 1) {
      if (!selectedPickup) errors.pickup = "Please select a pickup address to continue";
      if (showReturn && !selectedReturn) errors.return = "Please select a return address to continue";
    } else if (step === 2) {
      if (!consignee.fullName.trim()) errors.fullName = "Full name is required";
      if (!consignee.phone.trim()) errors.phone = "Phone is required";
    } else if (step === 3) {
      if (!shipment.invoiceValue.trim()) errors.invoiceValue = "Invoice value is required";
    } else if (step === 4) {
      if (!pkg.weight.trim()) errors.weight = "Weight is required";
      if (!pkg.length.trim() || !pkg.width.trim() || !pkg.height.trim()) errors.dimensions = "All dimensions are required";
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedPickup, showReturn, selectedReturn, consignee, shipment, pkg]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      const next = currentStep + 1;
      setHighestValidStep(Math.max(highestValidStep, next));
      setCurrentStep(next);
    }
  };

  const handleStepClick = (stepNum: number) => {
    if (stepNum <= currentStep) {
      setStepErrors({});
      setCurrentStep(stepNum);
    } else if (stepNum === currentStep + 1) {
      handleNext();
    } else {
      toast.error("Please complete the current step first");
    }
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

  const canNext = currentStep < 5;
  const canPrev = currentStep > 1;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Add Order" breadcrumb={["Dropshipper", "Add Order"]}
        actions={
          <Button variant="outline" className="border-primary text-primary hover:bg-primary-light gap-2">
            <Plus className="h-4 w-4" />Add Warehouse
          </Button>
        }
      />

      <div className="flex gap-6">
        {/* Left stepper */}
        <div className="hidden md:flex flex-col gap-1 w-52 shrink-0">
          {steps.map((s) => {
            const active = currentStep === s.num;
            const done = currentStep > s.num;
            const clickable = s.num <= highestValidStep || s.num <= currentStep;
            return (
              <button key={s.num} onClick={() => handleStepClick(s.num)}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm transition-colors",
                  active ? "bg-primary-light text-primary font-medium" : done ? "text-success" : "text-text-secondary",
                  clickable ? "cursor-pointer hover:text-text-primary" : "cursor-not-allowed opacity-50"
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
              </button>
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

              {/* Right preview cards */}
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
                  <Input value={consignee.phone} onChange={e => setConsignee(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 98000 00000" className={stepErrors.phone ? "border-danger" : ""} />
                  {stepErrors.phone && <p className="text-xs text-danger mt-1">{stepErrors.phone}</p>}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={consignee.email} onChange={e => setConsignee(p => ({ ...p, email: e.target.value }))}
                    placeholder="customer@email.com" />
                </div>
                <div>
                  <Label>Alt Phone</Label>
                  <Input value={consignee.altPhone} onChange={e => setConsignee(p => ({ ...p, altPhone: e.target.value }))}
                    placeholder="Alternate number" />
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Shipment Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Order Reference</Label>
                  <Input value={shipment.orderRef} onChange={e => setShipment(p => ({ ...p, orderRef: e.target.value }))} placeholder="e.g. ORD-12345" />
                </div>
                <div>
                  <Label>Payment Type<span className="text-danger">*</span></Label>
                  <select value={shipment.paymentType} onChange={e => setShipment(p => ({ ...p, paymentType: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                    <option>Prepaid</option><option>COD</option>
                  </select>
                </div>
                <div>
                  <Label>Invoice Value<span className="text-danger">*</span></Label>
                  <Input value={shipment.invoiceValue} onChange={e => setShipment(p => ({ ...p, invoiceValue: e.target.value }))}
                    placeholder="₹0.00" type="number" className={stepErrors.invoiceValue ? "border-danger" : ""} />
                  {stepErrors.invoiceValue && <p className="text-xs text-danger mt-1">{stepErrors.invoiceValue}</p>}
                </div>
                <div><Label>COD Amount</Label>
                  <Input value={shipment.codAmount} onChange={e => setShipment(p => ({ ...p, codAmount: e.target.value }))} placeholder="₹0.00" type="number" />
                </div>
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

          {currentStep === 5 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Choose Courier</h3>
              <div>
                <Label className="mb-2 block">Selection Mode<span className="text-danger">*</span></Label>
                <div className="flex gap-4">
                  {["Priority Selection", "Courier Selection"].map(m => (
                    <label key={m} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="courier-mode" className="accent-primary" defaultChecked={m === "Priority Selection"} />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-sm text-text-muted">Priority Selection will automatically assign the best courier based on your priority settings.</p>
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
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2" onClick={() => navigate("/dropshipper/orders")}>
                Submit Order
              </Button>
            )}
          </div>
        </div>
      </div>

      <AddAddressModal open={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleAddAddress} />
    </div>
  );
}
