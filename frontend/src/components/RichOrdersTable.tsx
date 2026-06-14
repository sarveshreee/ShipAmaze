import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Order } from "@/types/logistics";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Printer, Ban, Pencil, SlidersHorizontal, X, MapPin, Phone, Mail, Package, Monitor, Download, Settings, CheckSquare, Save, Clock, User, Trash2, Truck, Calendar, IndianRupee, Tag } from "lucide-react";
import { ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { EditSkuModal } from "@/components/EditSkuModal";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { cn } from "@/lib/utils";

import { getRates, type VelocityRate } from "@/services/velocityService";
import { forwardShipmentBlockers } from "@/lib/forwardShipmentValidation";
import { toast } from "sonner";
import { printShippingLabel } from "@/components/ShippingLabel";
import * as orderService from "@/services/orderService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const INDIAN_STATES = [
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chandigarh","Chhattisgarh","Dadra and Nagar Haveli","Daman and Diu","Delhi","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka",
  "Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya",
  "Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu",
  "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"
];

const IVR_OPTIONS = [
  "Except IVR", "Call Picked (No Response)", "Order Confirmed", "Order Cancelled",
  "Call not picked", "Call initiated", "Call Failed", "Response Awaited"
];
const WHATSAPP_OPTIONS = [
  "Except Whatsapp", "Msg Sent", "Msg Delivered", "Msg Read",
  "Order Confirmed", "Order Cancelled", "Response Awaited", "Msg Failed",
  "Address Update Request"
];

interface FilterPopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function FilterPopover({ open, onClose, children, anchorRef }: FilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px] max-w-[340px] max-h-[400px] overflow-auto">
      {children}
    </div>
  );
}

// Edit Order Product Modal
interface EditProductModalProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  onSave: (orderId: string, products: any[], codAmount: number) => void;
}

function EditProductModal({ open, onClose, order, onSave }: EditProductModalProps) {
  const [products, setProducts] = useState<{ name: string; price: string; qty: string; sku: string }[]>([]);
  const [codAmount, setCodAmount] = useState("");

  useEffect(() => {
    if (open && order) {
      const prods = (order.products || []).map(p => ({
        name: p.name || "",
        price: String(p.price || order.amount || 0),
        qty: String(p.qty || 1),
        sku: (p as any).sku || "",
      }));
      if (prods.length === 0) prods.push({ name: "", price: "", qty: "1", sku: "" });
      setProducts(prods);
      setCodAmount(String(order.amount || 0));
    }
  }, [open, order]);

  const updateProduct = (idx: number, field: string, value: string) => {
    setProducts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addProduct = () => setProducts(prev => [...prev, { name: "", price: "", qty: "1", sku: "" }]);
  const removeProduct = (idx: number) => { if (products.length > 1) setProducts(prev => prev.filter((_, i) => i !== idx)); };

  const handleSubmit = () => {
    const mapped = products.map(p => ({ name: p.name, price: Number(p.price), qty: Number(p.qty), sku: p.sku }));
    onSave(order.id, mapped, Number(codAmount));
    onClose();
    toast.success("Product details updated");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-lg font-semibold">Edit Order Product</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">Total COD Amount</span>
              <Input value={codAmount} onChange={e => setCodAmount(e.target.value)} type="number" className="w-24 h-8 text-sm" />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {products.map((p, idx) => (
            <div key={idx} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex gap-4">
                <div className="h-20 w-20 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                  <Package className="h-8 w-8 text-text-muted" />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Product Name<span className="text-danger">*</span></Label>
                    <Input value={p.name} onChange={e => updateProduct(idx, "name", e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Product Price<span className="text-danger">*</span></Label>
                    <Input value={p.price} onChange={e => updateProduct(idx, "price", e.target.value)} type="number" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Product Qty<span className="text-danger">*</span></Label>
                    <Input value={p.qty} onChange={e => updateProduct(idx, "qty", e.target.value)} type="number" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Product SKU</Label>
                    <Input value={p.sku} onChange={e => updateProduct(idx, "sku", e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
              </div>
              {products.length > 1 && (
                <button onClick={() => removeProduct(idx)} className="text-xs text-danger hover:underline">Remove</button>
              )}
            </div>
          ))}
          <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary-light" onClick={addProduct}>
            + Add Product
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            <Save className="h-4 w-4" /> Submit
          </Button>
          <Button variant="secondary" onClick={onClose} className="bg-sidebar text-sidebar-primary-foreground hover:bg-sidebar-accent">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit Order Price Modal
function EditPriceModal({ open, onClose, order, onSave }: { open: boolean; onClose: () => void; order: Order; onSave: (id: string, amount: number, codAmount: number) => void }) {
  const [orderAmount, setOrderAmount] = useState("");
  const [codAmount, setCodAmount] = useState("");

  useEffect(() => {
    if (open && order) {
      setOrderAmount(String(order.amount || 0));
      setCodAmount(String(order.amount || 0));
    }
  }, [open, order]);

  const handleSubmit = () => {
    onSave(order.id, Number(orderAmount), Number(codAmount));
    onClose();
    toast.success("Order price updated");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Edit Order Price</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">Order Amount</Label>
            <Input value={orderAmount} onChange={e => setOrderAmount(e.target.value)} type="number" className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Order COD Amount</Label>
            <Input value={codAmount} onChange={e => setCodAmount(e.target.value)} type="number" className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={handleSubmit} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            <Save className="h-4 w-4" /> Submit
          </Button>
          <Button variant="secondary" onClick={onClose} className="bg-sidebar text-sidebar-primary-foreground hover:bg-sidebar-accent">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit Order Details (Address) Modal
function EditAddressModal({ open, onClose, order, onSave }: { open: boolean; onClose: () => void; order: Order; onSave: (id: string, data: any) => Promise<void> }) {
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerNumber: "",
    customerNumber2: "",
    address1: "",
    address2: "",
    pincode: "",
    city: "",
    state: "",
    weight: "",
    length: "",
    breadth: "",
    height: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && order) {
      const email = (order as any).email || `${order.customer.toLowerCase().replace(/\s/g, '')}@email.com`;
      setForm({
        customerName: order.customer || "",
        customerEmail: (order as any).customerEmail || email,
        customerNumber: (order as any).customerPhone || order.phone || "",
        customerNumber2: (order as any).phone2 || "",
        address1: (order as any).shippingAddress1 || order.address || "",
        address2: (order as any).shippingAddress2 || (order as any).address2 || "",
        pincode: (order as any).shippingPincode || order.pincode || "",
        city: (order as any).shippingCity || order.city || "",
        state: (order as any).shippingState || (order as any).state || "",
        weight: String(order.weight || "").replace(/[^\d.]/g, ""),
        length: String((order as any).length ?? "").replace(/[^\d.]/g, ""),
        breadth: String((order as any).breadth ?? (order as any).width ?? "").replace(/[^\d.]/g, ""),
        height: String((order as any).height ?? "").replace(/[^\d.]/g, ""),
      });
    }
  }, [open, order]);

  const handleSubmit = async () => {
    if (!form.state.trim()) return void toast.error("State is required");
    if (!/^\d{6}$/.test(form.pincode.trim())) return void toast.error("Pincode must be 6 digits");
    if (form.customerNumber.replace(/\D/g, "").length < 10) return void toast.error("Phone number is invalid");
    if (!(Number(form.weight) > 0)) return void toast.error("Package weight must be greater than 0");
    if (!(Number(form.length) > 0) || !(Number(form.breadth) > 0) || !(Number(form.height) > 0)) {
      return void toast.error("Length, breadth and height must be greater than 0");
    }

    setSubmitting(true);
    try {
      await onSave(order.id, {
        ...form,
        customerNumber: form.customerNumber.replace(/\D/g, ""),
      });
      onClose();
      toast.success("Order details updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Edit Order Details</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label className="text-sm font-medium">Customer Name</Label><Input value={form.customerName} onChange={e => set("customerName", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Customer Email</Label><Input value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Customer Number</Label><Input value={form.customerNumber} onChange={e => set("customerNumber", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Customer Number2</Label><Input value={form.customerNumber2} onChange={e => set("customerNumber2", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Shipping Address1</Label><Input value={form.address1} onChange={e => set("address1", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Shipping Address2</Label><Input value={form.address2} onChange={e => set("address2", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Shipping Pincode</Label><Input value={form.pincode} onChange={e => set("pincode", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Shipping City</Label><Input value={form.city} onChange={e => set("city", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Shipping State</Label><Input value={form.state} onChange={e => set("state", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Package Weight (kg)</Label><Input value={form.weight} onChange={e => set("weight", e.target.value)} type="number" min="0" step="0.01" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Length (cm)</Label><Input value={form.length} onChange={e => set("length", e.target.value)} type="number" min="0" step="0.01" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Width / Breadth (cm)</Label><Input value={form.breadth} onChange={e => set("breadth", e.target.value)} type="number" min="0" step="0.01" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">Height (cm)</Label><Input value={form.height} onChange={e => set("height", e.target.value)} type="number" min="0" step="0.01" className="mt-1" /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={() => void handleSubmit()} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            <Save className="h-4 w-4" /> Submit
          </Button>
          <Button variant="secondary" onClick={onClose} className="bg-sidebar text-sidebar-primary-foreground hover:bg-sidebar-accent">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  orders: Order[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onMarkJunk: (id: string) => void;
  onBulkJunk?: () => void;
  onOpenProcessModal?: () => void;
  onExport?: () => void;
  loading: boolean;
  activeTab?: string;
  onToggleSidebar?: () => void;
  showProcessSelected?: boolean;
  /** When true, Process Selected is visible but disabled (e.g. selection includes non–Ready-to-Ship orders). */
  processSelectedDisabled?: boolean;
  /** All / Manual / Channel tabs: bulk move to Ready to Ship only */
  showBulkMoveToReady?: boolean;
  onBulkMoveToReady?: () => Promise<void>;
  couriers?: Array<{ id: string; name: string }>;
  warehouses?: Array<{ id: string; warehouseName: string; city?: string; velocityWarehouseId?: string; isDefault?: boolean }>;
  onCreateShipment?: (payload: {
    orderId: string;
    warehouseId: string;
    velocityWarehouseId?: string;
    carrier_id?: string | number | "";
    courier_name?: string;
  }) => Promise<{
    success: boolean;
    data: {
      order_id: string;
      shipment_id: string;
      awb_code: string;
      carrier_name: string;
      label_url?: string;
      manifest_url?: string;
      shipping_charges?: number;
      cod_charges?: number;
      rto_charges?: number;
      status: string;
    };
  }>;
  /** Shown under the icon when the server returned zero rows (not loading). */
  emptyDescription?: string;
}

export function RichOrdersTable({
  orders,
  selected,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onMarkJunk,
  onBulkJunk,
  onOpenProcessModal,
  onExport,
  loading,
  activeTab,
  onToggleSidebar,
  showProcessSelected = true,
  processSelectedDisabled = false,
  showBulkMoveToReady = false,
  onBulkMoveToReady,
  couriers: _couriers = [],
  warehouses = [],
  onCreateShipment,
  emptyDescription = "No orders found for these filters.",
}: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { canEditSku, canProcessOrders } = useDropshipperAccess();
  const [bulkMoveToReadyConfirmOpen, setBulkMoveToReadyConfirmOpen] = useState(false);
  const [productFilter, setProductFilter] = useState({ open: false, search: "", mode: "AND" as "OR"|"AND"|"NOT", selectedNames: new Set<string>() });
  const [amountFilter, setAmountFilter] = useState({ open: false, from: "", to: "" });
  const [addressFilter, setAddressFilter] = useState({ open: false, search: "", selectedStates: new Set<string>(), validPincodes: false, invalidPincodes: false, invalidContact: false });
  const [commFilter, setCommFilter] = useState({ open: false, ivrSelected: new Set<string>(), whatsappSelected: new Set<string>() });

  // New filters for Order Details and Customer Details
  const [orderDetailsFilter, setOrderDetailsFilter] = useState({ open: false, dateFrom: "", dateTo: "", paymentType: "" as "" | "COD" | "Prepaid" });
  const [customerFilter, setCustomerFilter] = useState({ open: false, search: "", city: "" });

  const productRef = useRef<HTMLTableCellElement>(null);
  const amountRef = useRef<HTMLTableCellElement>(null);
  const addressRef = useRef<HTMLTableCellElement>(null);
  const commRef = useRef<HTMLTableCellElement>(null);
  const orderDetailsRef = useRef<HTMLTableCellElement>(null);
  const customerRef = useRef<HTMLTableCellElement>(null);

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [editingRemark, setEditingRemark] = useState<string | null>(null);
  const [junkConfirmId, setJunkConfirmId] = useState<string | null>(null);
  const [shipmentModalOrder, setShipmentModalOrder] = useState<Order | null>(null);
  const [shipmentItemsMissing, setShipmentItemsMissing] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [velocityCouriers, setVelocityCouriers] = useState<VelocityRate[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [shipmentSubmitting, setShipmentSubmitting] = useState(false);

  useEffect(() => {
    if (!shipmentModalOrder) return;
    setShipmentItemsMissing(false);
    const orderPickup = (shipmentModalOrder.pickupAddress && typeof shipmentModalOrder.pickupAddress === "object")
      ? shipmentModalOrder.pickupAddress
      : undefined;
    const orderVelocityWh = (orderPickup as any)?.velocityWarehouseId || (shipmentModalOrder as any).velocityWarehouseId;
    const normVel = (v: string | undefined) => String(v || "").trim().toUpperCase();
    const matchPickup = shipmentModalOrder.pickupAddressId
      ? warehouses.find((w) => w.id === shipmentModalOrder.pickupAddressId)?.id
      : undefined;
    const linkedByWhCode = orderVelocityWh
      ? warehouses.find((w) => normVel(w.velocityWarehouseId) === normVel(orderVelocityWh))?.id
      : undefined;
    const velocityLinked =
      warehouses.find((w) => w.isDefault && w.velocityWarehouseId?.trim()) ??
      warehouses.find((w) => w.velocityWarehouseId?.trim());
    const defaultPickup = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    setSelectedWarehouseId(matchPickup ?? linkedByWhCode ?? velocityLinked?.id ?? defaultPickup?.id ?? "");
    setSelectedCourierId("");
    setVelocityCouriers([]);
  }, [shipmentModalOrder, warehouses]);

  useEffect(() => {
    if (!shipmentModalOrder) return;
    const pin = String(shipmentModalOrder.shippingPincode ?? (shipmentModalOrder as any).pincode ?? "").replace(/\D/g, "").slice(0, 6);
    const fromPin = String((shipmentModalOrder.pickupAddress as any)?.pincode ?? "").replace(/\D/g, "").slice(0, 6);
    const weight = Number(String(shipmentModalOrder.weight ?? "0.5").replace(/[^\d.]/g, "")) || 0.5;
    const payment = String(shipmentModalOrder.payment ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";
    if (pin.length !== 6 || fromPin.length !== 6) return;
    let cancelled = false;
    setCouriersLoading(true);
    void getRates({
      from: fromPin,
      to: pin,
      weight,
      payment_mode: payment as "cod" | "prepaid",
      cod_value: payment === "cod" ? Number(shipmentModalOrder.amount ?? 0) : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setVelocityCouriers(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setVelocityCouriers([]);
      })
      .finally(() => {
        if (!cancelled) setCouriersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shipmentModalOrder]);

  // Edit modals
  const [editProductOrder, setEditProductOrder] = useState<Order | null>(null);
  const [editPriceOrder, setEditPriceOrder] = useState<Order | null>(null);
  const [editAddressOrder, setEditAddressOrder] = useState<Order | null>(null);
  const [editSku, setEditSku] = useState<{ order: Order; lineIndex: number } | null>(null);

  const allProductNames = Array.from(new Set(orders.flatMap(o => (o.products || []).map(p => p.name))));
  const allCities = Array.from(new Set(orders.map(o => o.city).filter(Boolean)));

  const filteredOrders = orders.filter(o => {
    // Product filter
    if (productFilter.selectedNames.size > 0) {
      const orderProductNames = (o.products || []).map(p => p.name);
      if (productFilter.mode === "AND") {
        if (!Array.from(productFilter.selectedNames).every(n => orderProductNames.includes(n))) return false;
      } else if (productFilter.mode === "OR") {
        if (!Array.from(productFilter.selectedNames).some(n => orderProductNames.includes(n))) return false;
      } else {
        if (Array.from(productFilter.selectedNames).some(n => orderProductNames.includes(n))) return false;
      }
    }
    // Amount filter
    if (amountFilter.from && o.amount < Number(amountFilter.from)) return false;
    if (amountFilter.to && o.amount > Number(amountFilter.to)) return false;
    // Address filter
    if (addressFilter.invalidPincodes) {
      if (o.pincode && /^\d{6}$/.test(o.pincode)) return false;
    }
    if (addressFilter.validPincodes) {
      if (!o.pincode || !/^\d{6}$/.test(o.pincode)) return false;
    }
    if (addressFilter.selectedStates.size > 0) {
      const cityLower = (o.city || "").toLowerCase();
      if (!Array.from(addressFilter.selectedStates).some(s => cityLower.includes(s.toLowerCase()))) return false;
    }
    // Order Details filter
    if (orderDetailsFilter.dateFrom) {
      const orderDate = o.date ? new Date(o.date) : new Date();
      if (orderDate < new Date(orderDetailsFilter.dateFrom)) return false;
    }
    if (orderDetailsFilter.dateTo) {
      const orderDate = o.date ? new Date(o.date) : new Date();
      if (orderDate > new Date(orderDetailsFilter.dateTo)) return false;
    }
    if (orderDetailsFilter.paymentType) {
      if (o.payment !== orderDetailsFilter.paymentType) return false;
    }
    // Customer filter
    if (customerFilter.search) {
      const q = customerFilter.search.toLowerCase();
      if (!(o.customer || "").toLowerCase().includes(q)) return false;
    }
    if (customerFilter.city) {
      if ((o.city || "").toLowerCase() !== customerFilter.city.toLowerCase()) return false;
    }
    return true;
  });
  const hasCourierDetailsColumn =
    activeTab === "pending-pickup" ||
    activeTab === "in-transit" ||
    activeTab === "out-for-delivery" ||
    activeTab === "delivered" ||
    activeTab === "failed";
  const columnCount = hasCourierDetailsColumn ? 12 : 11;

  const isValidPincode = (pin: string | undefined) => pin != null && /^\d{6}$/.test(pin);
  const channelLabel = (o: Order) =>
    o.channel === "Shopify" || o.externalSource === "shopify" ? "Shopify" : "Manual";

  const handleEditProductSave = (orderId: string, products: any[], codAmount: number) => {
    const stored = JSON.parse(localStorage.getItem("shipflow_orders") || "[]");
    const updated = stored.map((o: any) => {
      if (o.id === orderId || o.orderId === orderId || o.order_id === orderId) {
        return { ...o, products, amount: codAmount };
      }
      return o;
    });
    localStorage.setItem("shipflow_orders", JSON.stringify(updated));
  };

  const handleEditPriceSave = (orderId: string, amount: number, codAmount: number) => {
    const stored = JSON.parse(localStorage.getItem("shipflow_orders") || "[]");
    const updated = stored.map((o: any) => {
      if (o.id === orderId || o.orderId === orderId || o.order_id === orderId) {
        return { ...o, amount, codAmount };
      }
      return o;
    });
    localStorage.setItem("shipflow_orders", JSON.stringify(updated));
  };

  const handleEditAddressSave = async (orderId: string, data: any) => {
    const updated = await orderService.updateOrder(orderId, {
      customerName: data.customerName,
      consigneeName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerNumber,
      shippingAddress1: data.address1,
      shippingAddress2: data.address2,
      shippingPincode: data.pincode,
      shippingCity: data.city,
      shippingState: data.state,
      weight: Number(data.weight),
      length: Number(data.length),
      breadth: Number(data.breadth),
      width: Number(data.breadth),
      height: Number(data.height),
    });

    // Keep Create Shipment dialog in sync right after save.
    setShipmentModalOrder((prev) => (prev && prev.id === orderId ? { ...prev, ...updated } : prev));
    window.dispatchEvent(new Event("shipamaze:refetch:orders"));
  };

  const handleEditOrder = (order: Order) => {
    // Store order data in localStorage for the AddOrder page to pick up
    const editData = {
      id: order.id,
      customer: order.customer,
      phone: order.phone,
      email: (order as any).email || "",
      altPhone: (order as any).phone2 || "",
      address: order.address || "",
      address2: (order as any).address2 || "",
      addressType: (order as any).addressType || "Home",
      pincode: order.pincode || "",
      city: order.city || "",
      state: (order as any).state || "",
      country: (order as any).country || "India",
      payment: order.payment || "Prepaid",
      amount: order.amount || 0,
      products: (order.products || []).map(p => ({
        name: p.name || "",
        qty: String(p.qty || 1),
        price: String(p.price || 0),
        category: (p as any).category || "",
        sku: (p as any).sku || "",
        hsn: (p as any).hsn || "",
      })),
      weight: order.weight || "",
      dimensions: order.dimensions || "",
      courier: order.courier || "",
      pickupAddress: (order as any).pickupAddress || "",
      pickupAddressId: (order as any).pickupAddressId || "",
      status: order.status,
    };
    localStorage.setItem("shipflow_edit_order", JSON.stringify(editData));
    navigate(`/dropshipper/add-order?edit=${order.id}`);
  };

  const toggleCommSet = (set: Set<string>, item: string) => {
    const n = new Set(set);
    if (n.has(item)) n.delete(item);
    else n.add(item);
    return n;
  };

  const FilterIcon = ({ active }: { active: boolean }) => (
    <SlidersHorizontal className={cn("h-3.5 w-3.5 transition-colors", active ? "text-primary" : "text-text-muted")} />
  );

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      {/* Action bar when orders are selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-surface-2/80 border-b border-border flex-wrap">
          <button onClick={onToggleSidebar} className="p-1.5 rounded-md hover:bg-surface-2 transition-colors" title="Enlarge to full screen">
            <Monitor className="h-4 w-4 text-primary" />
          </button>
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <span>Count Order: <strong>{selected.size}</strong></span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showBulkMoveToReady && onBulkMoveToReady && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary-light">
                      <Truck className="h-3.5 w-3.5" /> Move To
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem]">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        setBulkMoveToReadyConfirmOpen(true);
                      }}
                    >
                      Ready to Ship
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialog open={bulkMoveToReadyConfirmOpen} onOpenChange={setBulkMoveToReadyConfirmOpen}>
                  <AlertDialogContent className="sm:max-w-[400px]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Move to Ready to Ship</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-text-primary">
                        Move selected orders to Ready to Ship?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex gap-3 sm:gap-3">
                      <AlertDialogCancel className="border-none shadow-none text-text-secondary hover:text-text-primary">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-primary text-primary-foreground hover:bg-primary-dark"
                        onClick={() => {
                          setBulkMoveToReadyConfirmOpen(false);
                          void onBulkMoveToReady();
                        }}
                      >
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {showProcessSelected && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={processSelectedDisabled}
                title={
                  processSelectedDisabled
                    ? "All selected orders must be Ready to Ship with no AWB and no shipment created"
                    : undefined
                }
                onClick={() => {
                  if (processSelectedDisabled) return;
                  onOpenProcessModal?.();
                }}
              >
                <CheckSquare className="h-3.5 w-3.5" /> Process Selected
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark" onClick={onBulkJunk}>
              <Trash2 className="h-3.5 w-3.5" /> Bulk Junk
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-transparent">
              <th className="p-3 text-left w-10">
                <input type="checkbox" className="rounded border-border accent-primary"
                  checked={selected.size === filteredOrders.length && filteredOrders.length > 0}
                  onChange={e => e.target.checked ? onSelectAll(filteredOrders.map(o => o.id)) : onClearSelection()} />
              </th>
              {/* Order Details header with filter */}
              <th ref={orderDetailsRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[180px] relative">
                <div className="flex items-center gap-2">
                  <span>Order Details</span>
                  <button onClick={() => setOrderDetailsFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={!!(orderDetailsFilter.dateFrom || orderDetailsFilter.dateTo || orderDetailsFilter.paymentType)} />
                  </button>
                </div>
                <FilterPopover open={orderDetailsFilter.open} onClose={() => setOrderDetailsFilter(f => ({ ...f, open: false }))} anchorRef={orderDetailsRef}>
                  <div className="space-y-3">
                    <p className="font-semibold text-text-primary text-sm">Filter Orders</p>
                    <div>
                      <Label className="text-xs font-medium">Date From</Label>
                      <Input type="date" value={orderDetailsFilter.dateFrom} onChange={e => setOrderDetailsFilter(f => ({ ...f, dateFrom: e.target.value }))} className="h-9 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Date To</Label>
                      <Input type="date" value={orderDetailsFilter.dateTo} onChange={e => setOrderDetailsFilter(f => ({ ...f, dateTo: e.target.value }))} className="h-9 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Payment Type</Label>
                      <select value={orderDetailsFilter.paymentType} onChange={e => setOrderDetailsFilter(f => ({ ...f, paymentType: e.target.value as any }))}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <option value="">All</option>
                        <option value="COD">COD</option>
                        <option value="Prepaid">Prepaid</option>
                      </select>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setOrderDetailsFilter({ open: false, dateFrom: "", dateTo: "", paymentType: "" })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setOrderDetailsFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              {/* Product Name header with filter */}
              <th ref={productRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[200px] relative">
                <div className="flex items-center gap-2">
                  <span>Product Name</span>
                  <button onClick={() => setProductFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={productFilter.selectedNames.size > 0} />
                  </button>
                </div>
                <FilterPopover open={productFilter.open} onClose={() => setProductFilter(f => ({ ...f, open: false }))} anchorRef={productRef}>
                  <div className="space-y-3">
                    <p className="font-semibold text-text-primary text-sm">Filter by Product</p>
                    <Input placeholder="Search product..." value={productFilter.search} onChange={e => setProductFilter(f => ({ ...f, search: e.target.value }))} className="h-9 text-xs" />
                    <div className="flex gap-1">
                      {(["AND", "OR", "NOT"] as const).map(m => (
                        <button key={m} onClick={() => setProductFilter(f => ({ ...f, mode: m }))}
                          className={cn("px-3 py-1 rounded text-xs font-medium", productFilter.mode === m ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text-secondary")}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-[180px] overflow-auto space-y-1">
                      {allProductNames.filter(n => n.toLowerCase().includes(productFilter.search.toLowerCase())).map(name => (
                        <label key={name} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1">
                          <input type="checkbox" className="rounded accent-primary" checked={productFilter.selectedNames.has(name)}
                            onChange={() => setProductFilter((f) => {
                              const n = new Set(f.selectedNames);
                              if (n.has(name)) n.delete(name);
                              else n.add(name);
                              return { ...f, selectedNames: n };
                            })} />
                          {name}
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setProductFilter({ open: false, search: "", mode: "AND", selectedNames: new Set() })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setProductFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[170px]">
                SKU
              </th>
              {/* Customer Details header with filter */}
              <th ref={customerRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[180px] relative">
                <div className="flex items-center gap-2">
                  <span>Customer Details</span>
                  <button onClick={() => setCustomerFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={!!(customerFilter.search || customerFilter.city)} />
                  </button>
                </div>
                <FilterPopover open={customerFilter.open} onClose={() => setCustomerFilter(f => ({ ...f, open: false }))} anchorRef={customerRef}>
                  <div className="space-y-3">
                    <p className="font-semibold text-text-primary text-sm">Filter Customers</p>
                    <div>
                      <Label className="text-xs font-medium">Customer Name</Label>
                      <Input placeholder="Search by name..." value={customerFilter.search} onChange={e => setCustomerFilter(f => ({ ...f, search: e.target.value }))} className="h-9 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">City</Label>
                      <select value={customerFilter.city} onChange={e => setCustomerFilter(f => ({ ...f, city: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <option value="">All Cities</option>
                        {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setCustomerFilter({ open: false, search: "", city: "" })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setCustomerFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[110px]">Channel</th>
              <th className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[160px]">Shipment Status</th>
              <th ref={amountRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[140px] relative">
                <div className="flex items-center gap-2">
                  <span>Amount Details</span>
                  <button onClick={() => setAmountFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={!!(amountFilter.from || amountFilter.to)} />
                  </button>
                </div>
                <FilterPopover open={amountFilter.open} onClose={() => setAmountFilter(f => ({ ...f, open: false }))} anchorRef={amountRef}>
                  <div className="space-y-3">
                    <p className="font-semibold text-text-primary text-sm">Amount Range</p>
                    <Input placeholder="From" type="number" value={amountFilter.from} onChange={e => setAmountFilter(f => ({ ...f, from: e.target.value }))} className="h-9 text-xs" />
                    <Input placeholder="To" type="number" value={amountFilter.to} onChange={e => setAmountFilter(f => ({ ...f, to: e.target.value }))} className="h-9 text-xs" />
                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setAmountFilter({ open: false, from: "", to: "" })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setAmountFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th ref={addressRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[220px] relative">
                <div className="flex items-center gap-2">
                  <span>Pickup Address</span>
                  <button onClick={() => setAddressFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={addressFilter.selectedStates.size > 0 || addressFilter.validPincodes || addressFilter.invalidPincodes || addressFilter.invalidContact} />
                  </button>
                </div>
                <FilterPopover open={addressFilter.open} onClose={() => setAddressFilter(f => ({ ...f, open: false }))} anchorRef={addressRef}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-text-primary text-sm">States</p>
                      <button className="text-xs text-primary font-semibold hover:underline" onClick={() => setAddressFilter(f => ({ ...f, selectedStates: new Set(INDIAN_STATES) }))}>Select All</button>
                    </div>
                    <Input placeholder="Search State" value={addressFilter.search} onChange={e => setAddressFilter(f => ({ ...f, search: e.target.value }))} className="h-9 text-xs" />
                    <div className="space-y-1">
                      {[
                        { label: "Valid Pincodes", key: "validPincodes" },
                        { label: "Invalid Pincodes", key: "invalidPincodes" },
                        { label: "Invalid Contact No.", key: "invalidContact" },
                      ].map(item => (
                        <label key={item.key} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1">
                          <input type="checkbox" className="rounded accent-primary" checked={(addressFilter as any)[item.key]}
                            onChange={() => setAddressFilter(f => {
                              if (item.key === "validPincodes") return { ...f, validPincodes: !f.validPincodes, invalidPincodes: false };
                              if (item.key === "invalidPincodes") return { ...f, invalidPincodes: !f.invalidPincodes, validPincodes: false };
                              return { ...f, invalidContact: !f.invalidContact };
                            })} />
                          {item.label}
                        </label>
                      ))}
                    </div>
                    <div className="max-h-[150px] overflow-auto space-y-1 border-t border-border pt-2">
                      {INDIAN_STATES.filter(s => s.toLowerCase().includes(addressFilter.search.toLowerCase())).map(state => (
                        <label key={state} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1">
                          <input type="checkbox" className="rounded accent-primary" checked={addressFilter.selectedStates.has(state)}
                            onChange={() => setAddressFilter(f => {
                              const n = new Set(f.selectedStates);
                              if (n.has(state)) n.delete(state);
                              else n.add(state);
                              return { ...f, selectedStates: n };
                            })} />
                          {state}
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setAddressFilter({ open: false, search: "", selectedStates: new Set(), validPincodes: false, invalidPincodes: false, invalidContact: false })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setAddressFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              {hasCourierDetailsColumn && (
                <th className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[160px]">Courier Details</th>
              )}
              <th className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[120px]">Remarks</th>
              <th className="p-3 text-center font-medium text-text-secondary min-w-[130px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <td key={j} className="p-4"><div className="h-4 bg-surface-2 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={columnCount} className="p-12 text-center text-text-muted">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-text-primary">{emptyDescription}</p>
                <p className="text-xs mt-1">Try clearing filters or changing your search.</p>
              </td></tr>
            ) : filteredOrders.map(o => {
              const products = o.products || [];
            const orderEmail = (o as any).email || `${(o.customer || '').toLowerCase().replace(/\s/g, '')}@email.com`;
              return (
                <tr key={o.id} className={cn("border-b border-border last:border-0 align-top transition-colors hover:bg-surface-2/40", selected.has(o.id) && "bg-primary-light/30")}>
                  <td className="p-3 align-middle">
                    <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => onToggleSelect(o.id)} />
                  </td>

                  {/* Order Details */}
                  <td className="p-3">
                    <div className="relative">
                      <div className="space-y-1.5">
                        <button onClick={() => window.open(`/order-detail?id=${o.id}`, '_blank')} className="text-primary font-semibold text-sm hover:underline">{o.id}</button>
                        <div className="flex items-center gap-1 text-text-muted">
                          <Clock className="h-3 w-3" />
                          <span className="text-[11px]">{(() => {
                            const d = o.date ? new Date(o.date) : new Date();
                            const day = d.getDate();
                            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                            const yr = String(d.getFullYear()).slice(2);
                            const hrs = d.getHours();
                            const mins = String(d.getMinutes()).padStart(2, '0');
                            const ampm = hrs >= 12 ? 'pm' : 'am';
                            const h12 = hrs % 12 || 12;
                            return `${day} ${months[d.getMonth()]}' ${yr} ${h12}:${mins} ${ampm}`;
                          })()}</span>
                        </div>
                        <p className="text-xs text-text-secondary">Order #{o.id.replace(/\D/g, '') || o.id}</p>
                        <div className="border-t border-border pt-1.5 mt-1.5">
                          <p className="text-xs"><span className="text-text-muted">Tag Status : </span><span className={cn("font-semibold", o.payment === "COD" ? "text-primary" : "text-success")}>{o.payment}</span></p>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Product Name */}
                  <td className="p-3">
                    <div className="relative min-w-[140px] max-w-[220px]">
                      <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-primary-light transition-colors"
                          title="Edit product"
                          onClick={(e) => { e.stopPropagation(); setEditProductOrder(o); }}
                        >
                          <Pencil className="h-3 w-3 text-primary" />
                        </button>
                      </div>
                      <div className="pr-8 space-y-2">
                        {products.length > 0 ? products.map((p, pi) => (
                          <div key={pi} className={cn(pi > 0 && "pt-2 border-t border-border/50")}>
                            <ProductNameText product={{ name: p.name, productName: (p as any).productName }} compact />
                          </div>
                        )) : <p className="text-xs text-text-muted">No products</p>}
                      </div>
                    </div>
                  </td>

                  {/* SKU */}
                  <td className="p-3">
                    <div className="space-y-2 min-w-[150px]">
                      {products.length > 0 ? products.map((p, pi) => (
                        <div key={pi} className={cn("flex items-start gap-1", pi > 0 && "pt-2 border-t border-border/50")}>
                          <SkuBadge product={{ sku: (p as { sku?: string }).sku }} index={pi} compact />
                          {canEditSku ? (
                            <button
                              type="button"
                              className="shrink-0 p-1 rounded hover:bg-surface-2 text-text-muted hover:text-primary"
                              title="Change SKU"
                              onClick={(e) => { e.stopPropagation(); setEditSku({ order: o, lineIndex: pi }); }}
                            >
                              <Tag className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      )) : <p className="text-xs text-text-muted">No SKU</p>}
                    </div>
                  </td>

                  {/* Customer Details */}
                  <td className="p-3">
                    <div className="relative">
                      <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditAddressOrder(o)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      <div className="space-y-1.5 pr-6">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-text-muted shrink-0" />
                          <p className="text-xs font-semibold text-text-primary">{o.customer}</p>
                        </div>
                        {((o as any).address || o.address) && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="h-3 w-3 text-text-muted shrink-0 mt-0.5" />
                            <div className="text-[11px] text-text-secondary leading-snug">
                              <p>{(o as any).address || ''}</p>
                              {(o as any).address2 && <p>{(o as any).address2}</p>}
                              <p>{o.pincode || ''}{o.pincode && o.city ? ' — ' : ''}{o.city || ''}{(o as any).state ? `, ${(o as any).state}` : ''}</p>
                            </div>
                          </div>
                        )}
                        {o.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-text-muted shrink-0" />
                            <span className="text-[11px] text-text-primary">{o.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-text-muted shrink-0" />
                          <a href={`mailto:${orderEmail}`} className="text-[11px] text-primary hover:underline">{orderEmail}</a>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Channel */}
                  <td className="p-3 align-middle">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      channelLabel(o) === "Shopify" ? "bg-blue-50 text-blue-700" : "bg-surface-2 text-text-secondary"
                    )}>
                      {channelLabel(o)}
                    </span>
                  </td>

                  {/* Shipment Status */}
                  <td className="p-3 align-middle">
                    <div className="space-y-1">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        o.awb ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}>
                        {o.awb ? (o.shipmentStatus || o.status || "Shipped") : "Awaiting shipment"}
                      </span>
                      {o.awb ? (
                        <>
                          <p className="text-[11px] font-mono text-text-primary">AWB: {o.awb}</p>
                          {(o.courierName || o.courier) ? (
                            <p className="text-[11px] text-text-muted">{o.courierName || o.courier}</p>
                          ) : null}
                        </>
                      ) : null}
                      {o.trackingId && o.trackingId !== o.awb ? (
                        <p className="text-[11px] text-text-muted font-mono">TRK: {o.trackingId}</p>
                      ) : null}
                    </div>
                  </td>

                  {/* Amount Details */}
                  <td className="p-3">
                    <div className="relative">
                      <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditPriceOrder(o)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      <div className="space-y-1.5 pr-6">
                        <p className="text-sm font-bold text-text-primary">₹{o.amount.toFixed(2)}</p>
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                          o.payment === "COD"
                            ? "bg-warning-light text-warning-dark"
                            : "bg-success-light text-success-dark"
                        )}>{o.payment}</span>
                        {o.payment === "COD" && (
                          <p className="text-[11px] text-text-muted">COD: ₹{o.amount.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Pickup Address */}
                  <td className="p-3">
                    {(() => {
                      const pickup = o.pickupAddress;
                      const pickupObj = typeof pickup === "object" && pickup ? pickup as any : null;
                      const pickupLabel = pickupObj?.label || pickupObj?.name || (typeof pickup === "string" ? pickup : "");
                      const pickupAddressText = pickupObj?.address || [pickupObj?.address1, pickupObj?.address2].filter(Boolean).join(", ");
                      const pickupPincode = pickupObj?.pincode || "";
                      const pickupCity = pickupObj?.city || "";
                      const pickupState = pickupObj?.state || "";
                      const pickupPhone = pickupObj?.phone || "";
                      const pickupEmail = pickupObj?.email || "";
                      const pickupVelocityWh = pickupObj?.velocityWarehouseId || (o as any).velocityWarehouseId || "";
                      return (
                        <div className="relative">
                          <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditAddressOrder(o)}>
                            <Pencil className="h-3 w-3 text-primary" />
                          </button>
                          <div className="space-y-1.5 pr-6">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="h-3 w-3 text-success mt-0.5 shrink-0" />
                              <div className="text-[11px] text-text-secondary leading-snug">
                                <p className="text-xs font-medium text-text-primary">{pickupLabel || "No pickup address"}</p>
                                {pickupAddressText && <p>{pickupAddressText}</p>}
                                <p>
                                  {pickupPincode ? (
                                    <span className="font-medium text-success">{pickupPincode}</span>
                                  ) : null}
                                  {pickupPincode && pickupCity ? ' – ' : ''}
                                  <span className="text-text-muted">{pickupCity}{pickupState ? `, ${pickupState}` : ''}</span>
                                </p>
                                {pickupVelocityWh && (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-success-light text-success-dark border border-success/30 mt-1">
                                    Velocity Linked {pickupVelocityWh}
                                  </span>
                                )}
                              </div>
                            </div>
                            {pickupPhone && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3 text-text-muted shrink-0" />
                                <span className="text-[11px] text-text-primary">{pickupPhone}</span>
                              </div>
                            )}
                            {pickupEmail && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3 text-text-muted shrink-0" />
                                <a href={`mailto:${pickupEmail}`} className="text-[11px] text-primary hover:underline">{pickupEmail}</a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>

                  {/* Courier Details (conditional) - must come BEFORE Remarks to match header order */}
                  {(activeTab === "pending-pickup" || activeTab === "in-transit" || activeTab === "out-for-delivery" || activeTab === "delivered" || activeTab === "failed") && (
                    <td className="p-3">
                      {(() => {
                        const courierName = o.courier || (o as any).courier_name || "-";
                        const eddDate = (o as any).edd ? new Date((o as any).edd) : (() => { const d = o.date ? new Date(o.date) : new Date(); d.setDate(d.getDate() + 4); return d; })();
                        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const eddStr = `${eddDate.getDate()} ${months[eddDate.getMonth()]} '${String(eddDate.getFullYear()).slice(2)}`;
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Truck className="h-3 w-3 text-text-muted shrink-0" />
                              <p className="text-xs font-semibold text-text-primary">{courierName}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3 w-3 text-text-muted shrink-0" />
                              <span className="text-[11px] text-text-secondary">EDD: {eddStr}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  )}

                  <td className="p-3">
                    <div className="relative min-h-[40px]">
                      <button className="absolute top-0 right-0 p-1 rounded hover:bg-primary-light transition-colors" onClick={() => setEditingRemark(editingRemark === o.id ? null : o.id)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      {editingRemark === o.id ? (
                        <div className="pr-5">
                          <textarea
                            className="w-full text-xs border border-border rounded p-1.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={2}
                            value={remarks[o.id] || ""}
                            onChange={e => setRemarks(r => ({ ...r, [o.id]: e.target.value }))}
                            onBlur={() => setEditingRemark(null)}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted pr-5">{remarks[o.id] || ""}</p>
                      )}
                    </div>
                  </td>

                  {/* Action */}
                  <td className="p-3 align-middle">
                    <div className="flex flex-col items-center gap-2">
                      {!["all", "channel", "manual", "ready-to-ship"].includes(activeTab) && (
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-primary hover:bg-primary-light"
                            onClick={() => window.open(`/order-detail?id=${o.id}`, '_blank')}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-secondary hover:bg-secondary-light"
                            onClick={() => { printShippingLabel(o); toast.success("Printing label..."); }}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {activeTab === "junk" ? null : activeTab === "reship" ? (
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary-light"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleEditOrder(o); }}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setJunkConfirmId(o.id); }}>
                            <Ban className="h-3 w-3" /> Junk
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {role === "admin" && !o.awb && !o.isJunk && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary-light"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setShipmentModalOrder(o);
                                setSelectedCourierId("");
                                setSelectedWarehouseId("");
                              }}
                            >
                              <Truck className="h-3 w-3" /> Create Shipment
                            </Button>
                          )}
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setJunkConfirmId(o.id); }}>
                            <Ban className="h-3 w-3" /> Junk
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border p-3 text-sm text-text-secondary">
        <span>Showing 1–{filteredOrders.length} of {filteredOrders.length} orders</span>
      </div>

      {/* Edit Product Modal */}
      {editProductOrder && (
        <EditProductModal open={!!editProductOrder} onClose={() => setEditProductOrder(null)} order={editProductOrder} onSave={handleEditProductSave} />
      )}

      <EditSkuModal
        open={!!editSku}
        onClose={() => setEditSku(null)}
        order={editSku?.order ?? null}
        lineIndex={editSku?.lineIndex ?? 0}
        onSaved={() => window.dispatchEvent(new Event("shipamaze:refetch:orders"))}
      />

      {/* Edit Price Modal */}
      {editPriceOrder && (
        <EditPriceModal open={!!editPriceOrder} onClose={() => setEditPriceOrder(null)} order={editPriceOrder} onSave={handleEditPriceSave} />
      )}

      {/* Edit Address Modal */}
      {editAddressOrder && (
        <EditAddressModal open={!!editAddressOrder} onClose={() => setEditAddressOrder(null)} order={editAddressOrder} onSave={handleEditAddressSave} />
      )}

      {/* Junk Confirmation Dialog */}
      <AlertDialog open={!!junkConfirmId} onOpenChange={(open) => !open && setJunkConfirmId(null)}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogDescription className="text-sm text-text-primary">
              Are you sure you want to move this order to Junk?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:gap-3">
            <AlertDialogCancel className="border-none shadow-none text-text-secondary hover:text-text-primary">No</AlertDialogCancel>
            <AlertDialogAction
              className="border border-primary text-primary bg-transparent hover:bg-primary-light"
              onClick={() => { if (junkConfirmId) { onMarkJunk(junkConfirmId); setJunkConfirmId(null); } }}>
              Yes, Move to Junk
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Shipment Dialog */}
      <Dialog open={!!shipmentModalOrder} onOpenChange={(open) => !open && setShipmentModalOrder(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create Shipment</DialogTitle>
            <p className="text-sm text-text-muted pt-1">
              Order <span className="font-mono text-text-primary">{shipmentModalOrder?.id}</span>
            </p>
          </DialogHeader>
          {shipmentModalOrder &&
            (() => {
              const blockers = forwardShipmentBlockers(shipmentModalOrder);
              if (blockers.length === 0) return null;
              return (
                <Alert variant="destructive" className="text-left border-destructive/40 bg-destructive/5">
                  <AlertTitle>Delivery details incomplete</AlertTitle>
                  <AlertDescription className="space-y-2 pt-1">
                    <p className="text-xs text-text-primary">
                      Velocity needs a full delivery address, pincode, weight, and dimensions. Fix these before creating a shipment.
                    </p>
                    <ul className="list-disc pl-4 text-xs text-text-primary space-y-0.5">
                      {blockers.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/40"
                        onClick={() => {
                          setEditAddressOrder(shipmentModalOrder);
                          setShipmentModalOrder(null);
                        }}
                      >
                        Edit delivery address
                      </Button>
                      {role === "dropshipper" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive/40"
                          onClick={() => {
                            handleEditOrder(shipmentModalOrder);
                            setShipmentModalOrder(null);
                          }}
                        >
                          Edit order (full form)
                        </Button>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              );
            })()}
          <div className="space-y-4 py-2">
            {shipmentItemsMissing && shipmentModalOrder && (
              <Alert variant="destructive" className="text-left border-destructive/40 bg-destructive/5">
                <AlertTitle>Order items missing</AlertTitle>
                <AlertDescription className="space-y-2 pt-1">
                  <p className="text-xs text-text-primary">
                    Order items are missing. Please edit the order and add at least one product.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-destructive/40"
                    onClick={() => {
                      handleEditOrder(shipmentModalOrder);
                      setShipmentModalOrder(null);
                    }}
                  >
                    Edit products
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {(() => {
              const selectedPickupWh = selectedWarehouseId
                ? warehouses.find((w) => w.id === selectedWarehouseId)?.velocityWarehouseId?.trim()
                : "";
              const modalOrderWh =
                selectedPickupWh ||
                shipmentModalOrder?.velocityWarehouseId ||
                ((shipmentModalOrder?.pickupAddress && typeof shipmentModalOrder.pickupAddress === "object")
                  ? (shipmentModalOrder.pickupAddress as any).velocityWarehouseId
                  : "");
              if (warehouses.length === 0) {
                const emptyHint =
                  role === "admin"
                    ? "Add a platform pickup in Admin → Pickup Addresses."
                    : role === "dropshipper"
                      ? "Add and link a pickup address in Pickup Addresses."
                      : "Add and link a warehouse in Warehouse settings.";
                return (
                  <div className="rounded-lg border border-dashed border-border bg-surface-2/40 p-4 text-center space-y-1">
                    <p className="text-sm text-text-secondary">No pickup addresses found.</p>
                    <p className="text-xs text-text-muted">{emptyHint}</p>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {modalOrderWh ? (
                    <div className="rounded-lg border border-success/30 bg-success-light/30 p-3 text-xs text-success-dark">
                      Order linked to Velocity warehouse:{" "}
                      <span className="font-mono font-semibold">{modalOrderWh}</span>
                    </div>
                  ) : null}
                  <div>
                    <Label className="text-xs font-medium">Pickup address</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    >
                      <option value="">Select pickup address</option>
                      {warehouses.map((w) => {
                        const vid = w.velocityWarehouseId?.trim() || "";
                        return (
                          <option key={w.id} value={w.id}>
                            {w.warehouseName}
                            {w.city ? ` — ${w.city}` : ""}
                            {vid ? ` — ${vid}` : ""}
                            {!vid ? " (not Velocity-linked)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              );
            })()}
            <div>
              <Label className="text-xs font-medium">Courier</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedCourierId}
                onChange={(e) => setSelectedCourierId(e.target.value)}
              >
                <option value="">Auto — Velocity assigns best carrier</option>
                {_couriers.map((c) => (
                  <option key={`local-${c.id}`} value={`name:${c.name}`}>
                    {c.name} (manual)
                  </option>
                ))}
                {velocityCouriers.map((r) => (
                  <option key={String(r.carrier_id)} value={String(r.carrier_id)}>
                    {r.carrier_name} — ₹{Number(r.total_charge ?? r.freight_charge ?? 0).toFixed(0)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-text-muted mt-1">
                {couriersLoading ? "Loading Velocity couriers…" : "Choose Auto or pick a specific courier for this shipment."}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="secondary" onClick={() => setShipmentModalOrder(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!shipmentModalOrder || !onCreateShipment) return;
                const blockers = forwardShipmentBlockers(shipmentModalOrder);
                if (blockers.length) {
                  toast.error("Fix delivery details before creating a shipment.", {
                    description: blockers.slice(0, 3).join(" "),
                  });
                  return;
                }
                if (!selectedWarehouseId || warehouses.length === 0) {
                  toast.error("Select a pickup address");
                  return;
                }
                const selectedPickup = warehouses.find((w) => w.id === selectedWarehouseId);
                if (!selectedPickup?.velocityWarehouseId?.trim()) {
                  toast.error("Selected pickup is not linked to Velocity");
                  return;
                }
                setShipmentSubmitting(true);
                try {
                  setShipmentItemsMissing(false);
                  const fallbackPickupId =
                    shipmentModalOrder.pickupAddressId ||
                    ((shipmentModalOrder.pickupAddress && typeof shipmentModalOrder.pickupAddress === "object")
                      ? ((shipmentModalOrder.pickupAddress as any).id as string | undefined)
                      : undefined) ||
                    "";
                  const courierPick = selectedCourierId || "";
                  const carrier_id = courierPick.startsWith("name:") ? "" : courierPick;
                  const res = await onCreateShipment({
                    orderId: shipmentModalOrder.id,
                    warehouseId: selectedWarehouseId || fallbackPickupId,
                    carrier_id,
                    courier_name: courierPick.startsWith("name:") ? courierPick.slice(5) : undefined,
                  });
                  const d = res.data;
                  const lines = [
                    `AWB: ${d.awb_code}`,
                    d.carrier_name && `Courier: ${d.carrier_name}`,
                    d.shipment_id && `Velocity shipment: ${d.shipment_id}`,
                    d.status && `Status: ${d.status}`,
                    d.label_url && "Label URL saved on order",
                    d.shipping_charges != null && `Charges: ₹${d.shipping_charges}`,
                  ].filter(Boolean) as string[];
                  toast.success("Shipment created", { description: lines.join(" · ") });
                  setShipmentModalOrder(null);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to create shipment";
                  if (message.toLowerCase().includes("order items are missing") || message.toLowerCase().includes("missing required fields: items")) {
                    setShipmentItemsMissing(true);
                    toast.error("Order items are missing. Please edit the order and add at least one product.");
                  } else {
                    toast.error(message);
                  }
                } finally {
                  setShipmentSubmitting(false);
                }
              }}
              disabled={
                shipmentSubmitting ||
                warehouses.length === 0 ||
                !selectedWarehouseId ||
                (shipmentModalOrder ? forwardShipmentBlockers(shipmentModalOrder).length > 0 : false)
              }
            >
              {shipmentSubmitting ? "Creating..." : "Create Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
