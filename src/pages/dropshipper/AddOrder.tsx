import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MapPin, User, Truck, Package, Box, ChevronRight, ChevronLeft, Plus, Phone, Save, Pencil, Trash2, X } from "lucide-react";
import { pickupAddresses as defaultPickupAddresses, orders as globalOrders } from "@/data/mockData";
import { AddAddressModal } from "@/components/AddAddressModal";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

// Numeric incrementing Order ID
const getNextOrderId = () => {
  const stored = localStorage.getItem("shipflow_next_order_num");
  const num = stored ? parseInt(stored, 10) : 10001;
  localStorage.setItem("shipflow_next_order_num", String(num + 1));
  return String(num);
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

const PRIORITY_STORAGE_KEY = "courierPriorities";

const categoryHsnMap: Record<string, string> = {
  "Electronics": "8542",
  "Clothing": "6109",
  "Footwear": "6404",
  "Books": "4901",
  "Cosmetics": "3304",
  "Food & Beverages": "2106",
  "Toys": "9503",
  "Furniture": "9403",
  "Jewelry": "7117",
  "Sports": "9506",
  "Health & Wellness": "3004",
  "Stationery": "4820",
  "Home Appliances": "8516",
  "Mobile Accessories": "8544",
  "Bags & Luggage": "4202",
};
const categoryOptions = Object.keys(categoryHsnMap);

export default function AddOrder() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const [extraAddresses, setExtraAddresses] = useState<typeof defaultPickupAddresses>([]);
  const allAddresses = [...defaultPickupAddresses, ...extraAddresses];

  const [selectedPickup, setSelectedPickup] = useState("");
  const [showReturn, setShowReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState("");

  // Step 2
  const [consignee, setConsignee] = useState({
    fullName: "", phone: "", email: "", altPhone: "",
    addressLine1: "", addressLine2: "", addressType: "Home", consigneeEmail: "",
    pincode: "", city: "", state: "", country: "",
  });

  // Step 3
  const [shipment, setShipment] = useState({ orderId: getNextOrderId(), paymentType: "Prepaid", codAmount: "" });
  const [products, setProducts] = useState([{ name: "", qty: "", price: "", category: "", sku: "", hsn: "" }]);
  const [extraCharges, setExtraCharges] = useState("");

  // Step 4 — per-product weight & dimensions
  const [packageDetails, setPackageDetails] = useState<{ weight: string; length: string; width: string; height: string }[]>([
    { weight: "", length: "", width: "", height: "" }
  ]);

  // Sync packageDetails count with products
  useEffect(() => {
    const validProducts = products.filter(p => p.name.trim());
    const count = Math.max(validProducts.length, 1);
    setPackageDetails(prev => {
      if (prev.length === count) return prev;
      const updated = [...prev];
      while (updated.length < count) updated.push({ weight: "", length: "", width: "", height: "" });
      return updated.slice(0, count);
    });
  }, [products]);

  // Step 5
  const [courierMode, setCourierMode] = useState<"priority" | "courier">("priority");
  const [expressType, setExpressType] = useState("");
  const [prioritySelections, setPrioritySelections] = useState<string[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [usingSavedPriorities, setUsingSavedPriorities] = useState(false);
  const [editingPriorities, setEditingPriorities] = useState(false);

  // Load saved priorities on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PRIORITY_STORAGE_KEY) || "[]");
      if (saved.length === 3) {
        setPrioritySelections(saved);
        setUsingSavedPriorities(true);
      }
    } catch {}
  }, []);

  // Saved orders
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>(() => {
    try { return JSON.parse(localStorage.getItem("savedOrders") || "[]"); } catch { return []; }
  });

  // Delete confirmation modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Saved order loaded notification
  const [loadedNotification, setLoadedNotification] = useState(false);

  // Validation
  const [stepErrors, setStepErrors] = useState<StepErrors>({});

  const selectedPickupAddr = allAddresses.find(a => a.id === selectedPickup);
  const selectedReturnAddr = allAddresses.find(a => a.id === selectedReturn);

  // Order Amount = sum of prices (price per unit, NOT multiplied by qty)
  const orderAmount = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const totalAmount = orderAmount + (Number(extraCharges) || 0);

  // Auto-fill COD amount based on payment type
  useEffect(() => {
    if (shipment.paymentType === "COD") {
      setShipment(p => ({ ...p, codAmount: totalAmount.toFixed(2) }));
    } else {
      setShipment(p => ({ ...p, codAmount: "0" }));
    }
  }, [shipment.paymentType, totalAmount]);

  useEffect(() => {
    if (currentStep === 3 && !shipment.orderId) {
      setShipment(p => ({ ...p, orderId: getNextOrderId() }));
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
      if (!consignee.addressLine1.trim()) errors.addressLine1 = "Address Line 1 is required";
      if (!consignee.pincode.trim()) errors.pincode = "Pin Code is required";
      if (!consignee.city.trim()) errors.city = "City is required";
      if (!consignee.state.trim()) errors.state = "State is required";
      if (!consignee.country.trim()) errors.country = "Country is required";
    } else if (step === 3) {
      const hasProduct = products.some(p => p.name.trim());
      if (!hasProduct) errors.products = "At least one product is required";
    } else if (step === 4) {
      const validProducts = products.filter(p => p.name.trim());
      for (let i = 0; i < validProducts.length; i++) {
        const pd = packageDetails[i];
        if (!pd || !pd.weight.trim()) { errors.weight = "Weight is required for all products"; break; }
        if (!pd.length.trim() || !pd.width.trim() || !pd.height.trim()) { errors.dimensions = "All dimensions are required"; break; }
      }
    } else if (step === 5) {
      if (courierMode === "priority" && prioritySelections.length < 3) errors.courier = "Select exactly 3 courier priorities";
      if (courierMode === "courier" && !selectedCourier) errors.courier = "Select a courier";
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedPickup, showReturn, selectedReturn, consignee, shipment, packageDetails, products, courierMode, prioritySelections, selectedCourier]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(s => s + 1);
    }
  };

  const handleStepClick = (_stepNum: number) => {};

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
      const updated = [...prev, courierId];
      if (updated.length === 3) {
        localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(updated));
        setUsingSavedPriorities(true);
        setEditingPriorities(false);
        toast.success("Priority settings saved");
      }
      return updated;
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
      data: { selectedPickup, showReturn, selectedReturn, consignee, shipment, products, packageDetails, courierMode, expressType, prioritySelections, selectedCourier, extraCharges },
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
    setShipment({ ...d.shipment, orderId: getNextOrderId() });
    setProducts(d.products);
    if (d.packageDetails) setPackageDetails(d.packageDetails);
    if (d.extraCharges !== undefined) setExtraCharges(d.extraCharges);
    setCourierMode(d.courierMode);
    setExpressType(d.expressType);
    setPrioritySelections(d.prioritySelections);
    setSelectedCourier(d.selectedCourier);
    setCurrentStep(1);
    setLoadedNotification(true);
  };

  const handleDeleteSavedOrder = () => {
    if (!deleteConfirmId) return;
    const updated = savedOrders.filter(s => s.id !== deleteConfirmId);
    setSavedOrders(updated);
    localStorage.setItem("savedOrders", JSON.stringify(updated));
    setDeleteConfirmId(null);
    toast.success("Saved order removed");
  };

  const handleSubmitOrder = () => {
    if (!validateStep(5)) return;

    const pickupAddr = allAddresses.find(a => a.id === selectedPickup);
    const courierName = courierMode === "courier"
      ? mockCouriers.find(c => c.id === selectedCourier)?.name || "N/A"
      : prioritySelections.map(id => mockCouriers.find(c => c.id === id)?.name).filter(Boolean).join(", ");

    const totalWeight = packageDetails.reduce((sum, pd) => sum + (Number(pd.weight) || 0), 0);
    const dims = packageDetails.map(pd => `${pd.length}x${pd.width}x${pd.height}`).join("; ");

    const newOrder = {
      id: shipment.orderId,
      customer: consignee.fullName,
      phone: `+91 ${consignee.phone}`,
      address: [consignee.addressLine1, consignee.addressLine2].filter(Boolean).join(", ") || "N/A",
      city: consignee.city || "N/A",
      pincode: consignee.pincode || "N/A",
      weight: `${totalWeight} kg`,
      courier: courierName as any,
      payment: shipment.paymentType as any,
      status: "ready-to-ship" as any,
      date: new Date().toISOString().split("T")[0],
      awb: `AWB${Date.now().toString().slice(-9)}`,
      amount: totalAmount,
      products: products.filter(p => p.name).map(p => ({ name: p.name, qty: Number(p.qty) || 1, price: Number(p.price) || 0, weight: "0.5 kg", category: p.category, sku: p.sku, hsn: p.hsn })),
      dimensions: dims + " cm",
      zone: "B",
      pickupAddress: pickupAddr?.label || "",
      source: "manual",
    };

    globalOrders.unshift(newOrder);

    const stored = localStorage.getItem("shipflow_orders");
    const localOrders: any[] = stored ? JSON.parse(stored) : [];
    localOrders.unshift(newOrder);
    localStorage.setItem("shipflow_orders", JSON.stringify(localOrders));

    toast.success("Order submitted successfully!");
    navigate("/dropshipper/orders");
  };

  const canNext = currentStep < 5;
  const canPrev = currentStep > 1;

  const validProducts = products.filter(p => p.name.trim());

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Add Order" breadcrumb={["Dropshipper", "Add Order"]} />

      {/* Loaded notification popup - top-right */}
      {loadedNotification && (
        <div className="fixed top-20 right-6 z-50 rounded-lg border border-border bg-card shadow-lg p-4 flex items-center gap-3 max-w-sm">
          <span className="text-success text-lg">✅</span>
          <span className="text-sm text-text-primary">Saved order loaded — Order ID regenerated</span>
          <button onClick={() => setLoadedNotification(false)} className="ml-2 text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Left stepper */}
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

              {/* Right panel */}
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
                      <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-accent-foreground" />
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

                {/* Saved Orders with delete icon */}
                {savedOrders.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h4 className="font-semibold text-text-primary mb-3 text-sm">Saved Orders</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {savedOrders.map(s => (
                        <div key={s.id} className="flex items-center gap-2">
                          <button onClick={() => loadSavedOrder(s)}
                            className="flex-1 text-left rounded-md border border-border p-2.5 hover:bg-surface-2/50 transition-colors text-xs">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-mono text-primary font-medium">{s.orderId}</span>
                                <p className="text-text-secondary mt-0.5">{s.consigneeName}</p>
                                <p className="text-text-muted">{s.pickupLabel}</p>
                              </div>
                              <span className="text-text-muted whitespace-nowrap ml-2">{s.dateSaved}</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(s.id); }}
                            className="shrink-0 h-8 w-8 flex items-center justify-center rounded border border-border text-text-muted hover:text-danger hover:border-danger/50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
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

              {/* Address fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <Label>Address Line 1<span className="text-danger">*</span></Label>
                  <Input value={consignee.addressLine1} onChange={e => setConsignee(p => ({ ...p, addressLine1: e.target.value }))}
                    placeholder="Enter Address Line 1..." className={stepErrors.addressLine1 ? "border-danger" : ""} />
                  {stepErrors.addressLine1 && <p className="text-xs text-danger mt-1">{stepErrors.addressLine1}</p>}
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  <Input value={consignee.addressLine2} onChange={e => setConsignee(p => ({ ...p, addressLine2: e.target.value }))}
                    placeholder="Enter Address Line 2..." />
                </div>
                <div>
                  <Label>Address Type</Label>
                  <select value={consignee.addressType} onChange={e => setConsignee(p => ({ ...p, addressType: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="Home">Home</option>
                    <option value="Work">Work</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={consignee.email ? `${consignee.email}@gmail.com` : ""} readOnly
                    placeholder="Enter Consignee email..." className="bg-surface-2 text-text-muted cursor-not-allowed" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <Label>Pin Code<span className="text-danger">*</span></Label>
                  <Input value={consignee.pincode} onChange={e => setConsignee(p => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    placeholder="Enter pincode..." className={stepErrors.pincode ? "border-danger" : ""} />
                  {stepErrors.pincode && <p className="text-xs text-danger mt-1">{stepErrors.pincode}</p>}
                </div>
                <div>
                  <Label>City<span className="text-danger">*</span></Label>
                  <Input value={consignee.city} onChange={e => setConsignee(p => ({ ...p, city: e.target.value }))}
                    placeholder="Enter city..." className={stepErrors.city ? "border-danger" : ""} />
                  {stepErrors.city && <p className="text-xs text-danger mt-1">{stepErrors.city}</p>}
                </div>
                <div>
                  <Label>State<span className="text-danger">*</span></Label>
                  <Input value={consignee.state} onChange={e => setConsignee(p => ({ ...p, state: e.target.value }))}
                    placeholder="Enter state..." className={stepErrors.state ? "border-danger" : ""} />
                  {stepErrors.state && <p className="text-xs text-danger mt-1">{stepErrors.state}</p>}
                </div>
                <div>
                  <Label>Country<span className="text-danger">*</span></Label>
                  <Input value={consignee.country} onChange={e => setConsignee(p => ({ ...p, country: e.target.value }))}
                    placeholder="Enter country..." className={stepErrors.country ? "border-danger" : ""} />
                  {stepErrors.country && <p className="text-xs text-danger mt-1">{stepErrors.country}</p>}
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
                  <Input value={shipment.orderId} readOnly tabIndex={-1}
                    className="bg-muted text-muted-foreground cursor-not-allowed border-muted pointer-events-none" />
                </div>
                <div>
                  <Label>Payment Type<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    {["Prepaid", "COD"].map(t => (
                      <button key={t} onClick={() => setShipment(p => ({ ...p, paymentType: t }))}
                        className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all",
                          shipment.paymentType === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-text-secondary hover:border-primary/50"
                        )}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              <h4 className="font-medium text-text-primary pt-2">Products</h4>
              {stepErrors.products && <p className="text-xs text-danger">{stepErrors.products}</p>}
              {products.map((prod, i) => (
                <div key={i} className="space-y-3 border border-border rounded-lg p-4">
                  <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-3 items-end">
                    <div><Label>Product Name<span className="text-danger">*</span></Label><Input value={prod.name} onChange={e => { const np = [...products]; np[i].name = e.target.value; setProducts(np); }} placeholder="Enter product name..." /></div>
                    <div><Label>Qty<span className="text-danger">*</span></Label><Input value={prod.qty} onChange={e => { const np = [...products]; np[i].qty = e.target.value; setProducts(np); }} placeholder="Qty..." type="number" /></div>
                    <div><Label>Price (₹)</Label><Input value={prod.price} onChange={e => { const np = [...products]; np[i].price = e.target.value; setProducts(np); }} placeholder="0" type="number" /></div>
                    <div>
                      {products.length > 1 && (
                        <button
                          onClick={() => setProducts(p => p.filter((_, idx) => idx !== i))}
                          className="h-9 w-9 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-danger hover:border-danger/50 hover:bg-danger/5 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <Label>Category</Label>
                      <select value={prod.category} onChange={e => {
                        const np = [...products];
                        np[i].category = e.target.value;
                        np[i].hsn = categoryHsnMap[e.target.value] || "";
                        setProducts(np);
                      }} className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
                        <option value="">Product category...</option>
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><Label>SKU</Label><Input value={prod.sku} onChange={e => { const np = [...products]; np[i].sku = e.target.value; setProducts(np); }} placeholder="SKU" /></div>
                    <div><Label>HSN</Label><Input value={prod.hsn} readOnly tabIndex={-1}
                      className="bg-muted text-muted-foreground cursor-not-allowed border-muted pointer-events-none" placeholder="HSN" /></div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setProducts(p => [...p, { name: "", qty: "", price: "", category: "", sku: "", hsn: "" }])}>
                <Plus className="h-3.5 w-3.5" />Add Product
              </Button>

              {/* Order Details */}
              <h4 className="font-bold text-text-primary pt-4">Order Details:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Order Amount<span className="text-danger">*</span></Label>
                  <Input value={orderAmount.toFixed(2)} readOnly tabIndex={-1}
                    className="bg-muted text-muted-foreground cursor-not-allowed border-muted pointer-events-none mt-1" />
                </div>
                <div>
                  <Label>Extra Charges (if any)</Label>
                  <Input value={extraCharges} onChange={e => setExtraCharges(e.target.value)} placeholder="0" type="number" className="mt-1" />
                </div>
                <div />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Total Amount<span className="text-danger">*</span></Label>
                  <Input value={totalAmount.toFixed(2)} readOnly tabIndex={-1}
                    className="bg-muted text-muted-foreground cursor-not-allowed border-muted pointer-events-none mt-1" />
                </div>
                <div>
                  <Label>Collectible COD Amount<span className="text-danger">*</span></Label>
                  <Input value={shipment.codAmount} readOnly tabIndex={-1}
                    className="bg-muted text-muted-foreground cursor-not-allowed border-muted pointer-events-none mt-1" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4 - Package Details (per product) */}
          {currentStep === 4 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Package Details</h3>
              {(validProducts.length > 0 ? validProducts : [{ name: "Product 1" }]).map((prod, i) => (
                <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-text-primary">{(prod as any).name || `Product ${i + 1}`}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Weight<span className="text-danger">*</span></Label>
                      <div className="flex gap-2 mt-1">
                        <Input value={packageDetails[i]?.weight || ""} onChange={e => {
                          const updated = [...packageDetails];
                          if (!updated[i]) updated[i] = { weight: "", length: "", width: "", height: "" };
                          updated[i].weight = e.target.value;
                          setPackageDetails(updated);
                        }} placeholder="Enter weight..." type="number" className={cn("flex-1", stepErrors.weight ? "border-danger" : "")} />
                        <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">KG</span>
                      </div>
                    </div>
                    <div>
                      <Label>Dimensions<span className="text-danger">*</span></Label>
                      <div className="flex gap-2 mt-1 items-center">
                        <Input value={packageDetails[i]?.length || ""} min="0" onChange={e => {
                          const updated = [...packageDetails];
                          if (!updated[i]) updated[i] = { weight: "", length: "", width: "", height: "" };
                          updated[i].length = e.target.value;
                          setPackageDetails(updated);
                        }} placeholder="L" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                        <span className="text-text-muted">×</span>
                        <Input value={packageDetails[i]?.width || ""} min="0" onChange={e => {
                          const updated = [...packageDetails];
                          if (!updated[i]) updated[i] = { weight: "", length: "", width: "", height: "" };
                          updated[i].width = e.target.value;
                          setPackageDetails(updated);
                        }} placeholder="W" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                        <span className="text-text-muted">×</span>
                        <Input value={packageDetails[i]?.height || ""} min="0" onChange={e => {
                          const updated = [...packageDetails];
                          if (!updated[i]) updated[i] = { weight: "", length: "", width: "", height: "" };
                          updated[i].height = e.target.value;
                          setPackageDetails(updated);
                        }} placeholder="H" type="number" className={stepErrors.dimensions ? "border-danger" : ""} />
                        <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">cm</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {stepErrors.weight && <p className="text-xs text-danger mt-1">{stepErrors.weight}</p>}
              {stepErrors.dimensions && <p className="text-xs text-danger mt-1">{stepErrors.dimensions}</p>}
              <div>
                <Label className="mb-2 block">Weight Presets</Label>
                <div className="flex flex-wrap gap-3">
                  {["0.5 KG", "1 KG", "2 KG", "5 KG", "Other"].map(w => (
                    <label key={w} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="weight-preset" className="accent-primary" defaultChecked={w === "Other"}
                        onChange={() => {
                          if (w !== "Other") {
                            const val = w.replace(" KG", "");
                            setPackageDetails(prev => prev.map(pd => ({ ...pd, weight: val })));
                          }
                        }} />
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
              <div>
                <Label>Express<span className="text-danger">*</span></Label>
                <select value={expressType} onChange={e => setExpressType(e.target.value)}
                  className="mt-1 w-48 rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                  <option value="">-- Select --</option>
                  <option value="Air">Air</option>
                  <option value="Surface">Surface</option>
                </select>
              </div>

              <div>
                <div className="flex gap-4">
                  {([["priority", "Priority Selection"], ["courier", "Courier Selection"]] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="courier-mode" className="accent-primary"
                        checked={courierMode === val} onChange={() => { setCourierMode(val); if (val === "courier") { setPrioritySelections([]); } setSelectedCourier(""); setEditingPriorities(false); }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {courierMode === "priority" && (
                <>
                  {prioritySelections.length === 3 && !editingPriorities ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-text-primary">Priority saved: <strong>{prioritySelections.map(id => mockCouriers.find(c => c.id === id)?.name).filter(Boolean).join(", ")}</strong></span>
                      <Button variant="link" size="sm" className="text-primary p-0 h-auto" onClick={() => setEditingPriorities(true)}>Edit</Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-text-muted">Click cards to set priority (1st, 2nd, 3rd). Click again to deselect.</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {mockCouriers.map(c => {
                          const idx = prioritySelections.indexOf(c.id);
                          const isSelected = idx !== -1;
                          return (
                            <button key={c.id} onClick={() => handlePriorityClick(c.id)}
                              className={cn("rounded-lg border p-3 text-center transition-all hover:shadow-sm relative",
                                isSelected ? "border-primary bg-primary-light" : "border-border hover:border-primary/40"
                              )}>
                              {isSelected && (
                                <span className="absolute -top-2 -right-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                                  {idx + 1}
                                </span>
                              )}
                              <p className="font-semibold text-text-primary text-sm">{c.name}</p>
                              <p className="text-[11px] text-text-muted mt-0.5">Slab: {c.slab}</p>
                              <p className="text-[11px] text-text-muted">EDD: {c.edd}</p>
                              <p className="text-xs font-semibold text-primary mt-1">₹{c.amount}</p>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {courierMode === "courier" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {mockCouriers.map(c => (
                    <button key={c.id} onClick={() => setSelectedCourier(c.id)}
                      className={cn("rounded-lg border p-3 text-center transition-all hover:shadow-sm",
                        selectedCourier === c.id ? "border-primary bg-primary-light" : "border-border hover:border-primary/40"
                      )}>
                      <p className="font-semibold text-text-primary text-sm">{c.name}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">Slab: {c.slab}</p>
                      <p className="text-[11px] text-text-muted">EDD: {c.edd}</p>
                      <p className="text-xs font-semibold text-primary mt-1">₹{c.amount}</p>
                    </button>
                  ))}
                </div>
              )}

              {stepErrors.courier && <p className="text-xs text-danger mt-1">{stepErrors.courier}</p>}

              {savedOrders.length > 0 && (
                <div className="mt-6 border-t border-border pt-4">
                  <h4 className="font-medium text-text-primary mb-2">Saved Orders</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {savedOrders.map(s => (
                      <div key={s.id} className="flex items-center gap-2">
                        <button onClick={() => loadSavedOrder(s)}
                          className="flex-1 text-left rounded-lg border border-border p-3 hover:bg-surface-2/50 transition-colors text-sm flex justify-between items-center">
                          <div>
                            <span className="font-mono text-primary font-medium">{s.orderId}</span>
                            <span className="mx-2 text-text-muted">•</span>
                            <span className="text-text-secondary">{s.consigneeName}</span>
                            <span className="mx-2 text-text-muted">•</span>
                            <span className="text-text-muted">{s.pickupLabel}</span>
                          </div>
                          <span className="text-xs text-text-muted">{s.dateSaved}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(s.id); }}
                          className="shrink-0 h-8 w-8 flex items-center justify-center rounded border border-border text-text-muted hover:text-danger hover:border-danger/50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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

      {/* Delete confirmation modal */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Saved Order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">Are you sure you want to remove this saved order?</p>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>No</Button>
            <Button className="bg-danger text-white hover:bg-danger/90" onClick={handleDeleteSavedOrder}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
