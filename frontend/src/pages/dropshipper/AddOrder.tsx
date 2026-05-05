import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MapPin, User, Truck, Package, Box, ChevronRight, ChevronLeft, Plus, Phone, Save, Pencil, Trash2, X } from "lucide-react";
import { usePickupAddresses } from "@/hooks/useApiData";
import * as orderService from "@/services/orderService";
import * as pickupService from "@/services/pickupService";
import { getRates, type VelocityRate } from "@/services/velocityService";
import type { PickupAddress } from "@/types/logistics";
import { AddAddressModal } from "@/components/AddAddressModal";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

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

interface SavedOrder {
  id: string;
  orderId: string;
  consigneeName: string;
  pickupLabel: string;
  dateSaved: string;
  data: any;
}

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
  const editOrderId = useMemo(() => new URLSearchParams(window.location.search).get("edit"), []);
  const { data: apiPickups = [], isLoading: pickupsLoading, refetch: refetchPickups } = usePickupAddresses();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const allAddresses = apiPickups;

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

  // Step 5 — Velocity rates (optional); blank carrier_id = auto assign
  const [velocityRates, setVelocityRates] = useState<VelocityRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  /** Empty string = auto-assign by Velocity */
  const [selectedCarrierId, setSelectedCarrierId] = useState("");

  const editAppliedRef = useRef(false);

  // Load edit order data from localStorage when ?edit= param is present (after pickup list fetch)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId || editAppliedRef.current) return;
    if (pickupsLoading) return;

    try {
      const editData = JSON.parse(localStorage.getItem("shipflow_edit_order") || "null") as Record<string, unknown> | null;
      if (!editData) return;

      editAppliedRef.current = true;

      const d = editData;

      // Step 1: Find matching pickup address
      const pickupMatch =
        (d.pickupAddressId && allAddresses.find((a) => a.id === String(d.pickupAddressId))) ||
        (d.pickupAddress && allAddresses.find((a) => a.label === d.pickupAddress));
      if (pickupMatch) setSelectedPickup(pickupMatch.id);

      // Step 2: Consignee Details
      const phone = String(d.phone ?? "").replace(/^\+91\s?/, "");
      setConsignee({
        fullName: String(d.customer ?? ""),
        phone: phone,
        email: String(d.email ?? ""),
        altPhone: String(d.altPhone ?? ""),
        addressLine1: String(d.address ?? ""),
        addressLine2: String(d.address2 ?? ""),
        addressType: String(d.addressType ?? "Home"),
        consigneeEmail: String(d.email ?? ""),
        pincode: String(d.pincode ?? ""),
        city: String(d.city ?? ""),
        state: String(d.state ?? ""),
        country: String(d.country ?? "India"),
      });

      // Step 3: Shipment Details
      const rawProducts = d.products;
      const editProducts = Array.isArray(rawProducts) && rawProducts.length > 0
        ? (rawProducts as Record<string, unknown>[]).map((p) => ({
            name: String(p.name ?? ""),
            qty: String(p.qty ?? ""),
            price: String(p.price ?? ""),
            category: String(p.category ?? ""),
            sku: String(p.sku ?? ""),
            hsn: String(p.hsn ?? ""),
          }))
        : [{ name: "", qty: "", price: "", category: "", sku: "", hsn: "" }];
      setProducts(editProducts);
      setShipment(prev => ({
        ...prev,
        orderId: editId,
        paymentType: String(d.payment ?? "Prepaid"),
        codAmount: d.payment === "COD" ? String(d.amount ?? 0) : "0",
      }));

      // Step 4: Package Details from weight/dimensions
      if (d.weight || d.dimensions) {
        const weightStr = String(d.weight ?? "").replace(/[^\d.]/g, "");
        const dimParts = String(d.dimensions ?? "").split(";").map((x: string) => x.trim());
        const pkgDetails = editProducts.filter((p: any) => p.name.trim()).map((_: any, i: number) => {
          const dims = dimParts[i] ? dimParts[i].replace(/\s*cm\s*/gi, "").split("x") : [];
          return {
            weight: i === 0 ? weightStr : "",
            length: dims[0] || "",
            width: dims[1] || "",
            height: dims[2] || "",
          };
        });
        if (pkgDetails.length > 0) setPackageDetails(pkgDetails);
      }

      // Step 5: optional carrier preference from order
      if (d.carrierCompanyId !== undefined && d.carrierCompanyId !== null && String(d.carrierCompanyId).trim() !== "") {
        setSelectedCarrierId(String(d.carrierCompanyId));
      }

      // Clean up
      localStorage.removeItem("shipflow_edit_order");
      setLoadedNotification(true);
    } catch (e) {
      console.error("Failed to load edit order data:", e);
      editAppliedRef.current = false;
    }
  }, [pickupsLoading, allAddresses]);

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
  const computedTotal = orderAmount + (Number(extraCharges) || 0);
  const [invoicePriceOverride, setInvoicePriceOverride] = useState<string | null>(null);
  const totalAmount = invoicePriceOverride !== null && invoicePriceOverride !== ""
    ? Number(invoicePriceOverride) || 0
    : computedTotal;

  // Auto-fill COD amount based on payment type (user can still override)
  useEffect(() => {
    if (shipment.paymentType === "COD") {
      setShipment(p => ({ ...p, codAmount: totalAmount.toFixed(2) }));
    } else {
      setShipment(p => ({ ...p, codAmount: "0" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.paymentType]);

  useEffect(() => {
    if (currentStep === 3 && !shipment.orderId) {
      setShipment(p => ({ ...p, orderId: getNextOrderId() }));
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 5) return;
    const from = selectedPickupAddr?.pincode?.trim();
    const to = consignee.pincode?.trim();
    const totalW = packageDetails.reduce((sum, pd) => sum + (Number(pd.weight) || 0), 0);
    const first = packageDetails[0] || { length: "10", width: "10", height: "10" };
    if (!from || !to || totalW <= 0) {
      setVelocityRates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setRatesLoading(true);
      try {
        const payMode = shipment.paymentType === "COD" ? "cod" : "prepaid";
        const res = await getRates({
          from,
          to,
          weight: totalW,
          length: Number(first.length) || 10,
          width: Number(first.width) || 10,
          height: Number(first.height) || 10,
          payment_mode: payMode,
          cod_value: payMode === "cod" ? totalAmount : undefined,
        });
        if (!cancelled) setVelocityRates(res.data ?? []);
      } catch {
        if (!cancelled) setVelocityRates([]);
      } finally {
        if (!cancelled) setRatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    selectedPickupAddr?.pincode,
    consignee.pincode,
    packageDetails,
    shipment.paymentType,
    totalAmount,
  ]);

  const validateStep = useCallback((step: number): boolean => {
    const errors: StepErrors = {};
    if (step === 1) {
      if (!selectedPickup) errors.pickup = "Please select pickup address";
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
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedPickup, showReturn, selectedReturn, consignee, shipment, packageDetails, products]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(s => s + 1);
    }
  };

  const handleStepClick = (_stepNum: number) => {};

  const handleAddAddress = async (addr: {
    tag: string;
    label: string;
    contactName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  }) => {
    try {
      const created = await pickupService.createPickupAddress({
        label: addr.label?.trim() || `${addr.tag} — ${addr.city}`,
        contactName: addr.contactName.trim(),
        phone: addr.phone.trim(),
        addressLine1: addr.addressLine1.trim(),
        addressLine2: addr.addressLine2.trim(),
        city: addr.city.trim(),
        state: addr.state.trim(),
        pincode: addr.pincode.trim(),
        country: addr.country?.trim() || "India",
        isDefault: false,
      });
      window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses"));
      await refetchPickups();
      setSelectedPickup(created.id);
      setShowAddModal(false);
      toast.success("Pickup address saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save pickup address");
    }
  };

  const handleSaveOrder = () => {
    const pickupAddr = allAddresses.find(a => a.id === selectedPickup);
    const saved: SavedOrder = {
      id: `saved-${Date.now()}`,
      orderId: shipment.orderId,
      consigneeName: consignee.fullName || "Unnamed",
      pickupLabel: pickupAddr?.label || "N/A",
      dateSaved: new Date().toLocaleString(),
      data: {
        selectedPickup,
        showReturn,
        selectedReturn,
        consignee,
        shipment,
        products,
        packageDetails,
        selectedCarrierId,
        extraCharges,
      },
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
    setSelectedCarrierId(typeof d.selectedCarrierId === "string" ? d.selectedCarrierId : "");
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

  const handleSubmitOrder = async () => {
    if (!validateStep(5)) return;

    const pickupAddr = allAddresses.find((a) => a.id === selectedPickup);
    if (pickupAddr && !pickupAddr.velocityWarehouseId?.trim()) {
      toast.warning("This pickup address is not linked to Velocity. Link it before generating AWB.");
    }

    const courierName =
      selectedCarrierId === ""
        ? "Auto assign (Velocity)"
        : velocityRates.find((r) => String(r.carrier_id) === selectedCarrierId)?.carrier_name || "Velocity";

    const totalWeight = packageDetails.reduce((sum, pd) => sum + (Number(pd.weight) || 0), 0);
    const firstPackage = packageDetails[0] || { length: "", width: "", height: "" };
    const length = Number(firstPackage.length || 0);
    const breadth = Number(firstPackage.width || 0);
    const height = Number(firstPackage.height || 0);
    const dims = packageDetails.map((pd) => `${pd.length}x${pd.width}x${pd.height}`).join("; ");

    try {
      const payload = {
        orderId: shipment.orderId,
        customer: consignee.fullName,
        customerName: consignee.fullName,
        customerEmail: consignee.email ? `${consignee.email}@gmail.com` : "",
        customerPhone: consignee.phone,
        phone: consignee.phone,
        address: [consignee.addressLine1, consignee.addressLine2].filter(Boolean).join(", ") || "N/A",
        shippingAddress1: consignee.addressLine1,
        shippingAddress2: consignee.addressLine2,
        city: consignee.city || "N/A",
        shippingCity: consignee.city || "N/A",
        state: consignee.state || undefined,
        shippingState: consignee.state || "",
        pincode: consignee.pincode || "N/A",
        shippingPincode: consignee.pincode || "",
        weight: String(totalWeight),
        length,
        width: breadth,
        breadth,
        height,
        courier: courierName,
        payment: shipment.paymentType,
        status: "ready-to-ship",
        date: new Date().toISOString().split("T")[0],
        awb: "",
        amount: totalAmount,
        products: products
          .filter((p) => p.name)
          .map((p) => ({
            name: p.name,
            qty: Number(p.qty) || 1,
            price: Number(p.price) || 0,
            weight: "0.5 kg",
            category: p.category,
            sku: p.sku,
            hsn: p.hsn,
            discount: 0,
            tax: 0,
          })),
        items: products
          .filter((p) => p.name)
          .map((p) => ({
            name: p.name,
            sku: p.sku || "",
            quantity: Number(p.qty) || 1,
            qty: Number(p.qty) || 1,
            units: Number(p.qty) || 1,
            price: Number(p.price) || 0,
            sellingPrice: Number(p.price) || 0,
            amount: Number(p.price) || 0,
            discount: 0,
            tax: 0,
          })),
        orderItems: products
          .filter((p) => p.name)
          .map((p) => ({
            name: p.name,
            sku: p.sku || "",
            quantity: Number(p.qty) || 1,
            qty: Number(p.qty) || 1,
            units: Number(p.qty) || 1,
            price: Number(p.price) || 0,
            sellingPrice: Number(p.price) || 0,
            amount: Number(p.price) || 0,
            discount: 0,
            tax: 0,
          })),
        dimensions: `${dims} cm`,
        zone: "B",
        pickupAddress: pickupAddr?.label || "",
        pickupAddressId: selectedPickup || undefined,
        carrier_id: selectedCarrierId === "" ? undefined : selectedCarrierId,
      };

      if (editOrderId) {
        await orderService.updateOrder(editOrderId, payload);
        toast.success("Order updated successfully!");
      } else {
        await orderService.createOrder(payload);
        toast.success("Order submitted successfully!");
      }
      navigate("/dropshipper/orders");
    } catch (e: unknown) {
      console.error("[add-order:submit] failed", { editOrderId, error: e });
      toast.error(e instanceof Error ? e.message : "Failed to submit order");
    }
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
                  <select
                    value={selectedPickup}
                    onChange={(e) => setSelectedPickup(e.target.value)}
                    className={cn(
                      "mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                      stepErrors.pickup ? "border-danger" : "border-border"
                    )}
                  >
                    <option value="">-- Select Pickup Address --</option>
                    {allAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
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
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Pickup locations</h4>
                  {pickupsLoading ? (
                    <p className="text-sm text-text-muted py-4">Loading addresses…</p>
                  ) : allAddresses.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-surface-2/30 p-4 text-center">
                      <p className="text-sm text-text-secondary">No pickup address found. Add one first.</p>
                      <Button asChild className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary-dark" size="sm">
                        <Link to="/dropshipper/pickup-addresses">Add Pickup Address</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {allAddresses.map((a) => {
                        const sel = selectedPickup === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSelectedPickup(a.id);
                              setStepErrors((prev) => ({ ...prev, pickup: "" }));
                            }}
                            className={cn(
                              "w-full text-left rounded-lg border p-3 transition-colors",
                              sel ? "border-primary bg-primary-light/50 ring-1 ring-primary/30" : "border-border bg-card hover:bg-surface-2/50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-text-primary truncate">{a.label}</p>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {a.isDefault && (
                                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Default</span>
                                )}
                                {a.velocityWarehouseId?.trim() ? (
                                  <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                                    Velocity linked
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Not linked
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-text-muted mt-1">
                              {a.city}, {a.state} · {a.pincode}
                            </p>
                            <p className="text-xs text-text-secondary mt-0.5 truncate">{a.contactName}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedPickupAddr && (
                  <div className="rounded-lg border border-border bg-card p-4 relative">
                    <div className="absolute top-3 right-3">
                      <div className="h-9 w-9 rounded-full bg-primary-light flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-text-primary text-sm mb-2">Selected</h4>
                    <p className="text-sm text-text-secondary font-medium">{selectedPickupAddr.label}</p>
                    <p className="text-xs text-text-muted mt-1 line-clamp-3">
                      {[selectedPickupAddr.addressLine1, selectedPickupAddr.addressLine2].filter(Boolean).join(", ")}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      {selectedPickupAddr.city}, {selectedPickupAddr.state} — {selectedPickupAddr.pincode}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-text-secondary">
                      <Phone className="h-3 w-3 shrink-0" />
                      {selectedPickupAddr.phone}
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
                  <Label>Invoice Price<span className="text-danger">*</span></Label>
                  <Input
                    value={invoicePriceOverride !== null ? invoicePriceOverride : computedTotal.toFixed(2)}
                    onChange={e => setInvoicePriceOverride(e.target.value)}
                    type="number"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Collectible COD Amount<span className="text-danger">*</span></Label>
                  <Input
                    value={shipment.codAmount}
                    onChange={e => setShipment(p => ({ ...p, codAmount: e.target.value }))}
                    type="number"
                    className="mt-1"
                  />
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
                            setPackageDetails(prev => {
                              const base = prev.length > 0 ? prev : [{ weight: "", length: "", width: "", height: "" }];
                              return base.map(pd => ({ ...pd, weight: val, length: val, width: val, height: val }));
                            });
                          } else {
                            setPackageDetails(prev => prev.map(pd => ({ ...pd, weight: "", length: "", width: "", height: "" })));
                          }
                        }} />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Velocity couriers / auto assign */}
          {currentStep === 5 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-text-primary">Carrier & rates</h3>
                <p className="text-sm text-text-muted mt-1">
                  Rates come from Velocity for your pickup and destination. Leave as auto assign or pick a service.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCarrierId("")}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-all",
                  selectedCarrierId === "" ? "border-primary bg-primary-light/50 ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                )}
              >
                <p className="font-semibold text-text-primary">Auto assign by Velocity</p>
                <p className="text-xs text-text-muted mt-1">Carrier will be chosen when you create shipment / AWB.</p>
              </button>

              {ratesLoading && <p className="text-sm text-text-muted">Loading rates from Velocity…</p>}

              {!ratesLoading && velocityRates.length === 0 && (
                <p className="text-sm text-text-muted">
                  No rate cards returned. You can still submit the order with auto assign.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {velocityRates.map((r) => {
                  const id = String(r.carrier_id);
                  const sel = selectedCarrierId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedCarrierId(id)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-all text-sm",
                        sel ? "border-primary bg-primary-light/50 ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                    >
                      <p className="font-semibold text-text-primary">{r.carrier_name}</p>
                      <p className="text-xs text-text-muted mt-1">Total: ₹{Number(r.total_charge).toFixed(2)}</p>
                      {(r.freight_charge !== undefined || r.cod_charge !== undefined) && (
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {r.freight_charge !== undefined ? `Freight ₹${Number(r.freight_charge).toFixed(2)}` : ""}
                          {r.cod_charge !== undefined ? ` · COD ₹${Number(r.cod_charge).toFixed(2)}` : ""}
                        </p>
                      )}
                      {r.tat && <p className="text-[11px] text-text-muted mt-1">Est. delivery: {r.tat}</p>}
                    </button>
                  );
                })}
              </div>

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
