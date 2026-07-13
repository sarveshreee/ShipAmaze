import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Order } from "@/types/logistics";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Printer, Ban, Pencil, SlidersHorizontal, X, MapPin, Phone, Mail, Package, Monitor, Download, Settings, CheckSquare, Save, Clock, User, Trash2, Truck, Calendar, IndianRupee, Tag, XCircle } from "lucide-react";
import { ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { EditSkuModal } from "@/components/EditSkuModal";
import { useDropshipperAccess } from "@/hooks/useDropshipperAccess";
import { cn } from "@/lib/utils";

import { getRates, type VelocityRate } from "@/services/velocityService";
import { forwardShipmentBlockers } from "@/lib/forwardShipmentValidation";
import { isOrderReadyToShip } from "@/lib/orderTabFilters";
import { toast } from "sonner";
import { printBulkInvoices, printBulkLabels, printShippingLabel } from "@/components/ShippingLabel";
import * as orderService from "@/services/orderService";
import { updatePickupAddress } from "@/services/pickupService";
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

const BULK_LABEL_PRINT_TABS = new Set([
  "pending-pickup",
  "in-transit",
  "out-for-delivery",
  "delivered",
  "reship",
  "failed",
]);

const IVR_OPTIONS = [
  "Except IVR", "Call Picked (No Response)", "Order Confirmed", "Order Cancelled",
  "Call not picked", "Call initiated", "Call Failed", "Response Awaited"
];
const WHATSAPP_OPTIONS = [
  "Except Whatsapp", "Msg Sent", "Msg Delivered", "Msg Read",
  "Order Confirmed", "Order Cancelled", "Response Awaited", "Msg Failed",
  "Address Update Request"
];

function extractPickupMeta(o: Order) {
  const pickup = o.pickupAddress;
  const pickupObj = typeof pickup === "object" && pickup ? pickup : null;
  const label =
    pickupObj?.label?.trim() ||
    pickupObj?.warehouseName?.trim() ||
    (pickupObj as { name?: string } | null)?.name?.trim() ||
    (typeof pickup === "string" ? pickup.trim() : "");
  const id = String(o.pickupAddressId ?? pickupObj?.id ?? "").trim();
  const key = id || label || "__unassigned__";
  const pincode = String(pickupObj?.pincode ?? "").replace(/\D/g, "");
  const velocityId = String(pickupObj?.velocityWarehouseId ?? o.velocityWarehouseId ?? "").trim();
  const hasPickup = Boolean(label || id || pickupObj);
  return {
    key,
    label: label || "No pickup assigned",
    city: String(pickupObj?.city ?? "").trim(),
    state: String(pickupObj?.state ?? "").trim(),
    pincode,
    velocityLinked: Boolean(velocityId),
    hasPickup,
    validPincode: pincode.length === 6,
  };
}

type AddressFilterState = {
  open: boolean;
  search: string;
  selectedPickupKeys: Set<string>;
  selectedStates: Set<string>;
  selectedCities: Set<string>;
  missingPickup: boolean;
  velocityLinked: boolean;
  velocityUnlinked: boolean;
  validPickupPincode: boolean;
  invalidPickupPincode: boolean;
};

const EMPTY_ADDRESS_FILTER: AddressFilterState = {
  open: false,
  search: "",
  selectedPickupKeys: new Set(),
  selectedStates: new Set(),
  selectedCities: new Set(),
  missingPickup: false,
  velocityLinked: false,
  velocityUnlinked: false,
  validPickupPincode: false,
  invalidPickupPincode: false,
};

function isAddressFilterActive(f: AddressFilterState): boolean {
  return (
    f.selectedPickupKeys.size > 0 ||
    f.selectedStates.size > 0 ||
    f.selectedCities.size > 0 ||
    f.missingPickup ||
    f.velocityLinked ||
    f.velocityUnlinked ||
    f.validPickupPincode ||
    f.invalidPickupPincode
  );
}

/** Tabs after Ready to Ship — show Cancel (→ Reship) instead of Junk. */
const POST_READY_TABS = new Set([
  "pending-pickup",
  "in-transit",
  "out-for-delivery",
  "delivered",
  "failed",
]);

function displayShipmentStatusLabel(o: Order): string {
  if (!String(o.awb ?? "").trim()) return "Awaiting shipment";
  const st = String(o.status ?? "").toLowerCase().replace(/-/g, "_");
  if (st === "ready_to_ship") return "pending_pickup";
  return String(o.shipmentStatus || o.status || "Shipped");
}

function displayOrderNumber(order: Order): string {
  const shopifyNumeric = String(order.shopifyOrderNumericId ?? "").trim();
  if (shopifyNumeric) return shopifyNumeric;

  const rawId = String(order.id ?? "").trim();
  const shopifyTail = /^shopify-.+-(\d{8,})$/i.exec(rawId);
  if (shopifyTail?.[1]) return shopifyTail[1];

  return rawId || "—";
}

/** Shopify merchant order name (#FK00011078) when synced from Shopify. */
function displayShopifyOrderLabel(order: Order): string {
  const name = String(order.externalOrderName ?? "").trim();
  if (name) return name.startsWith("#") ? name : `#${name}`;
  return `Order #${displayOrderNumber(order)}`;
}

function formatShopifyStoreLabel(order: Order): string {
  const storeName = String(order.shopifyStoreName ?? "").trim();
  if (storeName) return storeName.toUpperCase();
  const domain = String(order.shopifyShopDomain ?? "").trim();
  if (!domain) return "—";
  return domain.replace(/\.myshopify\.com$/i, "").toUpperCase();
}

function productImageUrl(product: { imageUrl?: string; image?: string } | undefined): string | undefined {
  const url = String(product?.imageUrl ?? product?.image ?? "").trim();
  return url || undefined;
}

function resolveOrderProductImage(
  order: Order,
  product: { name?: string; productName?: string; sku?: string; imageUrl?: string; image?: string },
  index: number
): string | undefined {
  const direct = productImageUrl(product);
  if (direct) return direct;

  const raw = order.shopifyLineItems;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const li = (raw[index] ??
    raw.find((row) => {
      const sku = String(row.sku ?? "").trim().toLowerCase();
      const title = String(row.title ?? row.name ?? "").trim().toLowerCase();
      const pSku = String(product.sku ?? "").trim().toLowerCase();
      const pName = String(product.name ?? product.productName ?? "").trim().toLowerCase();
      return (sku && pSku && sku === pSku) || (title && pName && title === pName);
    })) as Record<string, unknown> | undefined;

  if (!li) return undefined;
  const imageBlock = li.image as { src?: string; url?: string } | string | undefined;
  if (typeof imageBlock === "string" && imageBlock.trim()) return imageBlock.trim();
  if (typeof imageBlock === "object" && imageBlock) {
    const src = String(imageBlock.src ?? imageBlock.url ?? "").trim();
    if (src) return src;
  }
  const featured = li.featured_image as { url?: string; src?: string } | undefined;
  return String(featured?.url ?? featured?.src ?? "").trim() || undefined;
}

function reportVelocitySync(result: { velocitySync?: { synced: boolean; reason?: string } } | undefined) {
  if (!result?.velocitySync) return;
  if (result.velocitySync.synced) {
    toast.success("Changes synced to Velocity");
    return;
  }
  const reason = result.velocitySync.reason ?? "unknown error";
  toast.warning(`Saved locally. Velocity sync failed: ${reason}`);
}

const COURIER_FILTER_TABS = new Set([
  "pending-pickup",
  "in-transit",
  "out-for-delivery",
  "delivered",
]);

function normalizeStatusKey(status: unknown): string {
  return String(status ?? "").toLowerCase().replace(/[-\s]+/g, "_");
}

function validDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function latestStatusTime(order: Order, statuses: string[]): Date | null {
  const wanted = new Set(statuses.map(normalizeStatusKey));
  const matches = (order.statusHistory ?? [])
    .filter((event) => wanted.has(normalizeStatusKey(event.status)))
    .map((event) => validDate(event.at))
    .filter((date): date is Date => Boolean(date));
  if (matches.length === 0) return null;
  return matches.reduce((latest, date) => (date > latest ? date : latest), matches[0]);
}

function formatOrderTimestamp(date: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hrs = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "pm" : "am";
  const h12 = hrs % 12 || 12;
  return `${date.getDate()} ${months[date.getMonth()]}' ${String(date.getFullYear()).slice(2)} ${h12}:${mins} ${ampm}`;
}

function orderTimestampForTab(order: Order, activeTab?: string): { label: string; date: Date } {
  const tab = normalizeStatusKey(activeTab);
  const createdAt = validDate(order.createdAt) ?? validDate(order.date) ?? validDate(order.updatedAt) ?? new Date();

  if (tab === "pending_pickup") {
    return {
      label: "Pending Pickup",
      date:
        latestStatusTime(order, [
          "pending_pickup",
          "pending-pickup",
          "pickup_scheduled",
          "pickup-scheduled",
          "ready_for_pickup",
          "not_picked",
        ]) ??
        validDate(order.assignedDateTime) ??
        validDate(order.movedToReadyAt) ??
        createdAt,
    };
  }

  if (tab === "in_transit") {
    return {
      label: "In Transit",
      date:
        latestStatusTime(order, ["in_transit", "in-transit", "picked_up", "picked-up"]) ??
        validDate(order.pickupDate) ??
        createdAt,
    };
  }

  if (tab === "out_for_delivery") {
    return {
      label: "Out For Delivery",
      date: latestStatusTime(order, ["out_for_delivery", "out-for-delivery"]) ?? createdAt,
    };
  }

  if (tab === "delivered") {
    return {
      label: "Delivered",
      date: latestStatusTime(order, ["delivered"]) ?? createdAt,
    };
  }

  if (tab === "failed") {
    return {
      label: "Failed",
      date: latestStatusTime(order, ["failed", "rto", "ndr", "cancelled"]) ?? createdAt,
    };
  }

  return { label: "Created", date: createdAt };
}

interface FilterPopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function FilterPopover({ open, onClose, children, anchorRef }: FilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: "below" | "above" } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < 220 && rect.top > spaceBelow;

    let left = rect.left;
    const popoverWidth = 300;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    setPosition({
      top: openAbove ? rect.top - gap : rect.bottom + gap,
      left,
      placement: openAbove ? "above" : "below",
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px] max-w-[340px] max-h-[400px] overflow-auto"
      style={{
        top: position.top,
        left: position.left,
        transform: position.placement === "above" ? "translateY(-100%)" : undefined,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

// Edit Order Product Modal
interface EditProductModalProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  onSave: (orderId: string, products: any[], codAmount: number) => void | Promise<void>;
}

function EditProductModal({ open, onClose, order, onSave }: EditProductModalProps) {
  const [products, setProducts] = useState<{ name: string; price: string; qty: string; sku: string }[]>([]);
  const [codAmount, setCodAmount] = useState("");
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async () => {
    const mapped = products.map(p => ({ name: p.name, price: Number(p.price), qty: Number(p.qty), sku: p.sku }));
    setSaving(true);
    try {
      await onSave(order.id, mapped, Number(codAmount));
      onClose();
      toast.success("Product details updated and synced with Velocity");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update products");
    } finally {
      setSaving(false);
    }
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
                <div className="h-20 w-20 rounded-lg bg-surface-2 flex items-center justify-center shrink-0 overflow-hidden border border-border/60">
                  {productImageUrl(p) ? (
                    <img src={productImageUrl(p)} alt={p.name || "Product"} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-text-muted" />
                  )}
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
          <Button onClick={() => void handleSubmit()} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            {saving ? "Saving…" : <><Save className="h-4 w-4" /> Submit</>}
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
function EditPriceModal({ open, onClose, order, onSave }: { open: boolean; onClose: () => void; order: Order; onSave: (id: string, amount: number, codAmount: number) => void | Promise<void> }) {
  const [orderAmount, setOrderAmount] = useState("");
  const [codAmount, setCodAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setOrderAmount(String(order.amount || 0));
      setCodAmount(String(order.amount || 0));
    }
  }, [open, order]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(order.id, Number(orderAmount), Number(codAmount));
      onClose();
      toast.success("Order price updated and synced with Velocity");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update price");
    } finally {
      setSaving(false);
    }
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
          <Button onClick={() => void handleSubmit()} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            {saving ? "Saving…" : <><Save className="h-4 w-4" /> Submit</>}
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
  const { role } = useAuth();
  const hideCustomerContact = role === "vendor";
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
    if (!hideCustomerContact && form.customerNumber.replace(/\D/g, "").length < 10) {
      return void toast.error("Phone number is invalid");
    }
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
      toast.success("Order details updated and synced with Velocity");
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
          {!hideCustomerContact && (
            <>
              <div><Label className="text-sm font-medium">Customer Email</Label><Input value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} className="mt-1" /></div>
              <div><Label className="text-sm font-medium">Customer Number</Label><Input value={form.customerNumber} onChange={e => set("customerNumber", e.target.value)} className="mt-1" /></div>
              <div><Label className="text-sm font-medium">Customer Number2</Label><Input value={form.customerNumber2} onChange={e => set("customerNumber2", e.target.value)} className="mt-1" /></div>
            </>
          )}
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

function EditPickupModal({
  open,
  onClose,
  order,
  warehouses,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  warehouses: Array<{ id: string; warehouseName: string }>;
  onSave: (orderId: string, data: { pickupAddressId: string; phone: string; email: string; contactName: string }) => Promise<void>;
}) {
  const [pickupId, setPickupId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    const pickupObj =
      typeof order.pickupAddress === "object" && order.pickupAddress ? (order.pickupAddress as Record<string, unknown>) : null;
    setPickupId(String(order.pickupAddressId ?? pickupObj?.id ?? warehouses[0]?.id ?? ""));
    setContactName(String(pickupObj?.contactName ?? pickupObj?.label ?? pickupObj?.warehouseName ?? "").trim());
    setPhone(String(pickupObj?.phone ?? "").trim());
    setEmail(String(pickupObj?.email ?? "").trim());
  }, [open, order, warehouses]);

  const handleSubmit = async () => {
    if (!pickupId.trim()) return void toast.error("Select a pickup address");
    if (phone.replace(/\D/g, "").length < 10) return void toast.error("Pickup phone must be at least 10 digits");
    setSubmitting(true);
    try {
      await onSave(order.id, {
        pickupAddressId: pickupId.trim(),
        phone: phone.replace(/\D/g, ""),
        email: email.trim(),
        contactName: contactName.trim(),
      });
      onClose();
      toast.success("Pickup address updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update pickup address");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Edit Pickup Address</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">Pickup warehouse</Label>
            <select
              value={pickupId}
              onChange={(e) => setPickupId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select pickup…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.warehouseName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Contact name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Contact phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Contact email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
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
  onMarkReship?: (id: string) => void;
  onBulkJunk?: () => void;
  /** Label for bulk junk/delete action bar button (default: Bulk Junk). */
  bulkJunkLabel?: string;
  onOpenProcessModal?: () => void;
  onExport?: () => void;
  loading: boolean;
  /** Background refresh — keeps rows visible while new tab data loads. */
  isRefreshing?: boolean;
  activeTab?: string;
  onToggleSidebar?: () => void;
  showProcessSelected?: boolean;
  /** When true, Process Selected is visible but disabled (e.g. selection includes non–Ready-to-Ship orders). */
  processSelectedDisabled?: boolean;
  /** All / Manual / Channel tabs: bulk move to Ready to Ship only */
  showBulkMoveToReady?: boolean;
  onBulkMoveToReady?: () => Promise<void>;
  onMoveToReady?: (orderId: string) => Promise<void>;
  couriers?: Array<{ id: string; name: string }>;
  warehouses?: Array<{ id: string; warehouseName: string; city?: string; velocityWarehouseId?: string; isDefault?: boolean }>;
  /** Refetch orders after inline edits so the table updates immediately. */
  onOrdersChanged?: () => void | Promise<void>;
  /** Open order details (eye / order id) — uses authenticated drawer with live data. */
  onViewOrder?: (order: Order) => void;
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
  onMarkReship,
  onBulkJunk,
  bulkJunkLabel = "Bulk Junk",
  onOpenProcessModal,
  onExport,
  loading,
  isRefreshing = false,
  activeTab,
  onToggleSidebar,
  showProcessSelected = true,
  processSelectedDisabled = false,
  showBulkMoveToReady = false,
  onBulkMoveToReady,
  onMoveToReady,
  couriers: _couriers = [],
  warehouses = [],
  onOrdersChanged,
  onViewOrder,
  onCreateShipment,
  emptyDescription = "No orders found for these filters.",
}: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { canEditSku, canProcessOrders } = useDropshipperAccess();
  const showProviderBrand = role === "admin";
  const hideCustomerContact = role === "vendor";
  const showPickupColumn = role !== "dropshipper";
  const showStoreDetailsColumn = role === "admin";
  const showCourierRemarkFilters = COURIER_FILTER_TABS.has(activeTab ?? "");
  const [bulkMoveToReadyConfirmOpen, setBulkMoveToReadyConfirmOpen] = useState(false);
  const [bulkDeleteJunkConfirmOpen, setBulkDeleteJunkConfirmOpen] = useState(false);
  const showBulkPrintActions = BULK_LABEL_PRINT_TABS.has(activeTab ?? "") && selected.size > 0;
  const [productFilter, setProductFilter] = useState({ open: false, search: "", mode: "AND" as "OR"|"AND"|"NOT", selectedNames: new Set<string>() });
  const [amountFilter, setAmountFilter] = useState({ open: false, from: "", to: "" });
  const [addressFilter, setAddressFilter] = useState<AddressFilterState>(EMPTY_ADDRESS_FILTER);
  const [commFilter, setCommFilter] = useState({ open: false, ivrSelected: new Set<string>(), whatsappSelected: new Set<string>() });

  // New filters for Order Details and Customer Details
  const [orderDetailsFilter, setOrderDetailsFilter] = useState({ open: false, dateFrom: "", dateTo: "", paymentType: "" as "" | "COD" | "Prepaid" });
  const [customerFilter, setCustomerFilter] = useState({ open: false, search: "", city: "" });
  const [storeFilter, setStoreFilter] = useState({ open: false, search: "", selectedStores: new Set<string>() });
  const [courierFilter, setCourierFilter] = useState({ open: false, search: "", selectedCouriers: new Set<string>() });
  const [remarkFilter, setRemarkFilter] = useState({ open: false, search: "", hasRemark: false, noRemark: false });

  const productRef = useRef<HTMLTableCellElement>(null);
  const amountRef = useRef<HTMLTableCellElement>(null);
  const addressRef = useRef<HTMLTableCellElement>(null);
  const commRef = useRef<HTMLTableCellElement>(null);
  const orderDetailsRef = useRef<HTMLTableCellElement>(null);
  const customerRef = useRef<HTMLTableCellElement>(null);
  const storeRef = useRef<HTMLTableCellElement>(null);
  const courierRef = useRef<HTMLTableCellElement>(null);
  const remarkRef = useRef<HTMLTableCellElement>(null);

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [editingRemark, setEditingRemark] = useState<string | null>(null);
  const [savingRemarkId, setSavingRemarkId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const o of orders) {
      next[o.id] = o.adminRemark ?? "";
    }
    setRemarks(next);
  }, [orders]);
  const [junkConfirmId, setJunkConfirmId] = useState<string | null>(null);
  const [reshipConfirmId, setReshipConfirmId] = useState<string | null>(null);
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
  const [editPickupOrder, setEditPickupOrder] = useState<Order | null>(null);
  const [editSku, setEditSku] = useState<{ order: Order; lineIndex: number } | null>(null);

  const allProductNames = Array.from(new Set(orders.flatMap(o => (o.products || []).map(p => p.name))));
  const allCities = Array.from(new Set(orders.map(o => o.city).filter(Boolean)));

  const courierFilterOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const name = String(o.courierName || o.courier || "").trim();
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [orders]);

  const storeFilterOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.channel !== "Shopify" && o.externalSource !== "shopify") continue;
      const label = formatShopifyStoreLabel(o);
      if (!label || label === "—") continue;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([store, count]) => ({ store, count }))
      .sort((a, b) => b.count - a.count || a.store.localeCompare(b.store));
  }, [orders]);

  const pickupFilterOptions = useMemo(() => {
    const locationMap = new Map<string, { key: string; label: string; count: number }>();
    const stateMap = new Map<string, number>();
    const cityMap = new Map<string, number>();
    let missingPickupCount = 0;
    let velocityLinkedCount = 0;
    let velocityUnlinkedCount = 0;
    let validPincodeCount = 0;
    let invalidPincodeCount = 0;

    for (const o of orders) {
      const meta = extractPickupMeta(o);
      if (!meta.hasPickup) missingPickupCount += 1;
      if (meta.velocityLinked) velocityLinkedCount += 1;
      else if (meta.hasPickup) velocityUnlinkedCount += 1;
      if (meta.hasPickup) {
        if (meta.validPincode) validPincodeCount += 1;
        else invalidPincodeCount += 1;
      }
      const loc = locationMap.get(meta.key);
      if (loc) loc.count += 1;
      else locationMap.set(meta.key, { key: meta.key, label: meta.label, count: 1 });
      if (meta.state) stateMap.set(meta.state, (stateMap.get(meta.state) ?? 0) + 1);
      if (meta.city) cityMap.set(meta.city, (cityMap.get(meta.city) ?? 0) + 1);
    }

    const locations = [...locationMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const states = [...stateMap.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
    const cities = [...cityMap.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

    return {
      locations,
      states,
      cities,
      missingPickupCount,
      velocityLinkedCount,
      velocityUnlinkedCount,
      validPincodeCount,
      invalidPincodeCount,
    };
  }, [orders]);

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
    // Pickup address filter
    const pickupMeta = extractPickupMeta(o);
    if (addressFilter.missingPickup && pickupMeta.hasPickup) return false;
    if (addressFilter.validPickupPincode && (!pickupMeta.hasPickup || !pickupMeta.validPincode)) return false;
    if (addressFilter.invalidPickupPincode && (!pickupMeta.hasPickup || pickupMeta.validPincode)) return false;
    if (addressFilter.velocityLinked && !pickupMeta.velocityLinked) return false;
    if (addressFilter.velocityUnlinked && pickupMeta.velocityLinked) return false;
    if (addressFilter.selectedPickupKeys.size > 0 && !addressFilter.selectedPickupKeys.has(pickupMeta.key)) return false;
    if (addressFilter.selectedStates.size > 0 && !addressFilter.selectedStates.has(pickupMeta.state)) return false;
    if (addressFilter.selectedCities.size > 0 && !addressFilter.selectedCities.has(pickupMeta.city)) return false;
    // Order Details filter
    if (orderDetailsFilter.dateFrom) {
      const orderDate = orderTimestampForTab(o, activeTab).date;
      if (orderDate < new Date(orderDetailsFilter.dateFrom)) return false;
    }
    if (orderDetailsFilter.dateTo) {
      const orderDate = orderTimestampForTab(o, activeTab).date;
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
    if (storeFilter.selectedStores.size > 0) {
      if (o.channel !== "Shopify" && o.externalSource !== "shopify") return false;
      if (!storeFilter.selectedStores.has(formatShopifyStoreLabel(o))) return false;
    }
    if (courierFilter.selectedCouriers.size > 0) {
      const courierName = String(o.courierName || o.courier || "").trim();
      if (!courierFilter.selectedCouriers.has(courierName)) return false;
    }
    if (remarkFilter.hasRemark && !(remarks[o.id] ?? o.adminRemark ?? "").trim()) return false;
    if (remarkFilter.noRemark && Boolean((remarks[o.id] ?? o.adminRemark ?? "").trim())) return false;
    if (remarkFilter.search.trim()) {
      const q = remarkFilter.search.trim().toLowerCase();
      const text = (remarks[o.id] ?? o.adminRemark ?? "").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
  const hasCourierDetailsColumn =
    activeTab === "pending-pickup" ||
    activeTab === "in-transit" ||
    activeTab === "out-for-delivery" ||
    activeTab === "delivered" ||
    activeTab === "failed";
  const columnCount =
    (hasCourierDetailsColumn ? 12 : 11) -
    (showPickupColumn ? 0 : 1) +
    (showStoreDetailsColumn ? 1 : 0);

  const isValidPincode = (pin: string | undefined) => pin != null && /^\d{6}$/.test(pin);
  const channelLabel = (o: Order) =>
    o.channel === "Shopify" || o.externalSource === "shopify" ? "Shopify" : "Manual";

  const refreshOrders = useCallback(async () => {
    if (onOrdersChanged) {
      await onOrdersChanged();
    } else {
      window.dispatchEvent(new Event("shipamaze:refetch:orders"));
    }
  }, [onOrdersChanged]);

  const handleEditProductSave = async (orderId: string, products: any[], codAmount: number) => {
    const updated = await orderService.updateOrder(orderId, {
      products,
      orderItems: products,
      items: products,
      amount: codAmount,
    });
    reportVelocitySync(updated);
    await refreshOrders();
  };

  const handleEditPriceSave = async (orderId: string, amount: number, codAmount: number) => {
    const order = orders.find((o) => o.id === orderId);
    const isCod = order?.payment === "COD";
    const updated = await orderService.updateOrder(orderId, {
      amount: isCod ? codAmount : amount,
      ...(isCod ? { payment: "COD" as const } : {}),
    });
    reportVelocitySync(updated);
    await refreshOrders();
  };

  const handleEditAddressSave = async (orderId: string, data: any) => {
    const updated = await orderService.updateOrder(orderId, {
      customerName: data.customerName,
      consigneeName: data.customerName,
      ...(hideCustomerContact
        ? {}
        : {
            customerEmail: data.customerEmail,
            customerPhone: data.customerNumber,
          }),
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

    setShipmentModalOrder((prev) => (prev && prev.id === orderId ? { ...prev, ...updated } : prev));
    reportVelocitySync(updated);
    await refreshOrders();
  };

  const handleEditPickupSave = async (
    orderId: string,
    data: { pickupAddressId: string; phone: string; email: string; contactName: string }
  ) => {
    await updatePickupAddress(data.pickupAddressId, {
      phone: data.phone,
      email: data.email,
      contactName: data.contactName,
    });
    const updated = await orderService.updateOrder(orderId, { pickupAddressId: data.pickupAddressId });
    reportVelocitySync(updated);
    await refreshOrders();
  };

  const handleRemarkSave = async (orderId: string, text: string) => {
    setSavingRemarkId(orderId);
    try {
      const updated = await orderService.updateOrder(orderId, { adminRemark: text });
      reportVelocitySync(updated);
      await refreshOrders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save remark");
    } finally {
      setSavingRemarkId(null);
    }
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
    <div className="rounded-lg bg-card border border-border">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-primary/20 bg-gradient-to-r from-primary/[0.08] via-card to-secondary/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-white shadow-sm">
              {selected.size}
            </span>
            order{selected.size === 1 ? "" : "s"} selected
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showBulkMoveToReady && onBulkMoveToReady && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 border-2 border-secondary/30 bg-secondary/10 text-secondary-dark hover:bg-secondary hover:text-white shadow-sm font-semibold"
                    >
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
                type="button"
                size="sm"
                disabled={processSelectedDisabled}
                className="h-9 gap-2 px-4 text-xs font-bold bg-gradient-to-r from-primary to-primary-dark text-white shadow-md shadow-primary/30 hover:shadow-lg hover:brightness-105 border-0 disabled:opacity-50 disabled:shadow-none"
                title={
                  processSelectedDisabled
                    ? selected.size === 0
                      ? "Select at least one order"
                      : activeTab === "all" || activeTab === "junk"
                        ? "Select orders to process (junk orders will be restored and booked)"
                        : "Selected orders must not already have an AWB or shipment"
                    : undefined
                }
                onClick={() => {
                  if (processSelectedDisabled) return;
                  onOpenProcessModal?.();
                }}
              >
                <CheckSquare className="h-4 w-4" /> Process Selected
              </Button>
            )}
            {showBulkPrintActions && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 text-xs font-semibold border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                  onClick={() => {
                    const picked = orders.filter((o) => selected.has(o.id));
                    if (!picked.length) return;
                    const toastId = toast.loading(`Preparing ${picked.length} label(s)…`);
                    void printBulkLabels(picked)
                      .then(() => {
                        toast.success(`Opened ${picked.length} label(s)`, { id: toastId });
                      })
                      .catch((err: unknown) => {
                        toast.error(err instanceof Error ? err.message : "Bulk label print failed", { id: toastId });
                      });
                  }}
                >
                  <Printer className="h-3.5 w-3.5" /> Labels
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 text-xs font-semibold border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                  onClick={() => {
                    const picked = orders.filter((o) => selected.has(o.id));
                    if (!picked.length) return;
                    const toastId = toast.loading(`Preparing ${picked.length} invoice(s)…`);
                    void printBulkInvoices(picked)
                      .then(() => {
                        toast.success(`Opened ${picked.length} invoice(s)`, { id: toastId });
                      })
                      .catch((err: unknown) => {
                        toast.error(err instanceof Error ? err.message : "Bulk invoice print failed", { id: toastId });
                      });
                  }}
                >
                  <Printer className="h-3.5 w-3.5" /> Invoices
                </Button>
              </>
            )}
            {onBulkJunk && (
              activeTab === "junk" ? (
                <AlertDialog open={bulkDeleteJunkConfirmOpen} onOpenChange={setBulkDeleteJunkConfirmOpen}>
                  <Button
                    size="sm"
                    className="h-9 gap-2 px-4 text-xs font-bold border-2 border-danger/50 text-danger bg-danger/5 hover:bg-danger hover:text-white shadow-sm transition-colors"
                    onClick={() => setBulkDeleteJunkConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" /> {bulkJunkLabel}
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Permanently delete {selected.size} order(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the selected junk orders from ShipAmaze permanently. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-danger text-danger-foreground hover:bg-danger/90"
                        onClick={() => {
                          setBulkDeleteJunkConfirmOpen(false);
                          void onBulkJunk();
                        }}
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  size="sm"
                  className="h-9 gap-2 px-4 text-xs font-bold border-2 border-danger/50 text-danger bg-danger/5 hover:bg-danger hover:text-white shadow-sm transition-colors"
                  onClick={onBulkJunk}
                >
                  <Trash2 className="h-4 w-4" /> {bulkJunkLabel}
                </Button>
              )
            )}
          </div>
        </div>
      )}

      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-x-0 top-0 z-20 h-1 overflow-hidden bg-primary/10">
            <div className="h-full w-1/3 bg-primary animate-pulse rounded-full" />
          </div>
        )}
      <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-gradient-to-r from-primary/10 via-card to-secondary/10">
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
              {showStoreDetailsColumn && (
                <th ref={storeRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[150px] relative">
                  <div className="flex items-center gap-2">
                    <span>Store Details</span>
                    <button
                      onClick={() => setStoreFilter((f) => ({ ...f, open: !f.open }))}
                      className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"
                    >
                      <FilterIcon active={storeFilter.selectedStores.size > 0} />
                    </button>
                  </div>
                  <FilterPopover
                    open={storeFilter.open}
                    onClose={() => setStoreFilter((f) => ({ ...f, open: false }))}
                    anchorRef={storeRef}
                  >
                    <div className="space-y-3">
                      <p className="font-semibold text-text-primary text-sm">Filter by Store</p>
                      <Input
                        placeholder="Search store..."
                        value={storeFilter.search}
                        onChange={(e) => setStoreFilter((f) => ({ ...f, search: e.target.value }))}
                        className="h-9 text-xs"
                      />
                      <div className="max-h-[180px] overflow-auto space-y-1">
                        {storeFilterOptions
                          .filter((row) => row.store.toLowerCase().includes(storeFilter.search.toLowerCase()))
                          .map((row) => (
                            <label
                              key={row.store}
                              className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  className="rounded accent-primary shrink-0"
                                  checked={storeFilter.selectedStores.has(row.store)}
                                  onChange={() =>
                                    setStoreFilter((f) => {
                                      const n = new Set(f.selectedStores);
                                      if (n.has(row.store)) n.delete(row.store);
                                      else n.add(row.store);
                                      return { ...f, selectedStores: n };
                                    })
                                  }
                                />
                                <span className="truncate">{row.store}</span>
                              </span>
                              <span className="text-[10px] text-text-muted shrink-0">{row.count}</span>
                            </label>
                          ))}
                      </div>
                      <div className="flex justify-between pt-3 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs px-4"
                          onClick={() => setStoreFilter({ open: false, search: "", selectedStores: new Set() })}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark"
                          onClick={() => setStoreFilter((f) => ({ ...f, open: false }))}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </FilterPopover>
                </th>
              )}
              {/* Product Details header with filter */}
              <th ref={productRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[240px] relative">
                <div className="flex items-center gap-2">
                  <span>Product Details</span>
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
              {showPickupColumn && (
              <th ref={addressRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[220px] relative">
                <div className="flex items-center gap-2">
                  <span>Pickup Address</span>
                  <button onClick={() => setAddressFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={isAddressFilterActive(addressFilter)} />
                  </button>
                </div>
                <FilterPopover open={addressFilter.open} onClose={() => setAddressFilter(f => ({ ...f, open: false }))} anchorRef={addressRef}>
                  <div className="space-y-3">
                    <p className="font-semibold text-text-primary text-sm">Filter Pickup Address</p>
                    <Input
                      placeholder="Search pickup, city, or state…"
                      value={addressFilter.search}
                      onChange={(e) => setAddressFilter((f) => ({ ...f, search: e.target.value }))}
                      className="h-9 text-xs"
                    />

                    {(() => {
                      const q = addressFilter.search.trim().toLowerCase();
                      const quickFilters = [
                        pickupFilterOptions.missingPickupCount > 0 && {
                          key: "missingPickup" as const,
                          label: "No pickup assigned",
                          count: pickupFilterOptions.missingPickupCount,
                        },
                        pickupFilterOptions.velocityLinkedCount > 0 && {
                          key: "velocityLinked" as const,
                          label: "Velocity linked",
                          count: pickupFilterOptions.velocityLinkedCount,
                        },
                        pickupFilterOptions.velocityUnlinkedCount > 0 && {
                          key: "velocityUnlinked" as const,
                          label: "Not linked to Velocity",
                          count: pickupFilterOptions.velocityUnlinkedCount,
                        },
                        pickupFilterOptions.validPincodeCount > 0 && {
                          key: "validPickupPincode" as const,
                          label: "Valid pickup pincode",
                          count: pickupFilterOptions.validPincodeCount,
                        },
                        pickupFilterOptions.invalidPincodeCount > 0 && {
                          key: "invalidPickupPincode" as const,
                          label: "Invalid pickup pincode",
                          count: pickupFilterOptions.invalidPincodeCount,
                        },
                      ].filter(Boolean) as Array<{
                        key: "missingPickup" | "velocityLinked" | "velocityUnlinked" | "validPickupPincode" | "invalidPickupPincode";
                        label: string;
                        count: number;
                      }>;

                      const locations = pickupFilterOptions.locations.filter(
                        (loc) => !q || loc.label.toLowerCase().includes(q)
                      );
                      const cities = pickupFilterOptions.cities.filter(
                        (row) => !q || row.city.toLowerCase().includes(q)
                      );
                      const states = pickupFilterOptions.states.filter(
                        (row) => !q || row.state.toLowerCase().includes(q)
                      );

                      const togglePickupKey = (key: string) =>
                        setAddressFilter((f) => {
                          const n = new Set(f.selectedPickupKeys);
                          if (n.has(key)) n.delete(key);
                          else n.add(key);
                          return { ...f, selectedPickupKeys: n };
                        });

                      const toggleState = (state: string) =>
                        setAddressFilter((f) => {
                          const n = new Set(f.selectedStates);
                          if (n.has(state)) n.delete(state);
                          else n.add(state);
                          return { ...f, selectedStates: n };
                        });

                      const toggleCity = (city: string) =>
                        setAddressFilter((f) => {
                          const n = new Set(f.selectedCities);
                          if (n.has(city)) n.delete(city);
                          else n.add(city);
                          return { ...f, selectedCities: n };
                        });

                      if (quickFilters.length === 0 && locations.length === 0 && cities.length === 0 && states.length === 0) {
                        return (
                          <p className="text-xs text-text-muted py-2">
                            No pickup filter options in the current order list.
                          </p>
                        );
                      }

                      return (
                        <>
                          {quickFilters.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Quick filters</p>
                              {quickFilters.map((item) => (
                                <label
                                  key={item.key}
                                  className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      className="rounded accent-primary shrink-0"
                                      checked={addressFilter[item.key]}
                                      onChange={() =>
                                        setAddressFilter((f) => {
                                          if (item.key === "validPickupPincode") {
                                            return {
                                              ...f,
                                              validPickupPincode: !f.validPickupPincode,
                                              invalidPickupPincode: false,
                                            };
                                          }
                                          if (item.key === "invalidPickupPincode") {
                                            return {
                                              ...f,
                                              invalidPickupPincode: !f.invalidPickupPincode,
                                              validPickupPincode: false,
                                            };
                                          }
                                          return { ...f, [item.key]: !f[item.key] };
                                        })
                                      }
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </span>
                                  <span className="text-[10px] text-text-muted shrink-0">{item.count}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {locations.length > 0 && (
                            <div className="space-y-1 border-t border-border pt-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Pickup locations</p>
                                <button
                                  type="button"
                                  className="text-[10px] text-primary font-semibold hover:underline"
                                  onClick={() =>
                                    setAddressFilter((f) => ({
                                      ...f,
                                      selectedPickupKeys: new Set(locations.map((loc) => loc.key)),
                                    }))
                                  }
                                >
                                  Select all
                                </button>
                              </div>
                              <div className="max-h-[140px] overflow-auto space-y-1">
                                {locations.map((loc) => (
                                  <label
                                    key={loc.key}
                                    className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        className="rounded accent-primary shrink-0"
                                        checked={addressFilter.selectedPickupKeys.has(loc.key)}
                                        onChange={() => togglePickupKey(loc.key)}
                                      />
                                      <span className="truncate">{loc.label}</span>
                                    </span>
                                    <span className="text-[10px] text-text-muted shrink-0">{loc.count}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {cities.length > 0 && (
                            <div className="space-y-1 border-t border-border pt-2">
                              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Pickup city</p>
                              <div className="max-h-[120px] overflow-auto space-y-1">
                                {cities.map((row) => (
                                  <label
                                    key={row.city}
                                    className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        className="rounded accent-primary shrink-0"
                                        checked={addressFilter.selectedCities.has(row.city)}
                                        onChange={() => toggleCity(row.city)}
                                      />
                                      <span className="truncate">{row.city}</span>
                                    </span>
                                    <span className="text-[10px] text-text-muted shrink-0">{row.count}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {states.length > 0 && (
                            <div className="space-y-1 border-t border-border pt-2">
                              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Pickup state</p>
                              <div className="max-h-[120px] overflow-auto space-y-1">
                                {states.map((row) => (
                                  <label
                                    key={row.state}
                                    className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        className="rounded accent-primary shrink-0"
                                        checked={addressFilter.selectedStates.has(row.state)}
                                        onChange={() => toggleState(row.state)}
                                      />
                                      <span className="truncate">{row.state}</span>
                                    </span>
                                    <span className="text-[10px] text-text-muted shrink-0">{row.count}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setAddressFilter(EMPTY_ADDRESS_FILTER)}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setAddressFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              )}
              {hasCourierDetailsColumn && (
                <th ref={courierRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[160px] relative">
                  <div className="flex items-center gap-2">
                    <span>Courier Details</span>
                    {showCourierRemarkFilters && (
                      <button
                        onClick={() => setCourierFilter((f) => ({ ...f, open: !f.open }))}
                        className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"
                      >
                        <FilterIcon active={courierFilter.selectedCouriers.size > 0} />
                      </button>
                    )}
                  </div>
                  {showCourierRemarkFilters && (
                    <FilterPopover
                      open={courierFilter.open}
                      onClose={() => setCourierFilter((f) => ({ ...f, open: false }))}
                      anchorRef={courierRef}
                    >
                      <div className="space-y-3">
                        <p className="font-semibold text-text-primary text-sm">Filter by Courier</p>
                        <Input
                          placeholder="Search courier..."
                          value={courierFilter.search}
                          onChange={(e) => setCourierFilter((f) => ({ ...f, search: e.target.value }))}
                          className="h-9 text-xs"
                        />
                        <div className="max-h-[180px] overflow-auto space-y-1">
                          {courierFilterOptions
                            .filter((row) => row.name.toLowerCase().includes(courierFilter.search.toLowerCase()))
                            .map((row) => (
                              <label
                                key={row.name}
                                className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1"
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    className="rounded accent-primary shrink-0"
                                    checked={courierFilter.selectedCouriers.has(row.name)}
                                    onChange={() =>
                                      setCourierFilter((f) => {
                                        const n = new Set(f.selectedCouriers);
                                        if (n.has(row.name)) n.delete(row.name);
                                        else n.add(row.name);
                                        return { ...f, selectedCouriers: n };
                                      })
                                    }
                                  />
                                  <span className="truncate">{row.name}</span>
                                </span>
                                <span className="text-[10px] text-text-muted shrink-0">{row.count}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between pt-3 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs px-4"
                            onClick={() => setCourierFilter({ open: false, search: "", selectedCouriers: new Set() })}
                          >
                            Clear
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark"
                            onClick={() => setCourierFilter((f) => ({ ...f, open: false }))}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    </FilterPopover>
                  )}
                </th>
              )}
              <th ref={remarkRef} className="p-3 text-left font-semibold uppercase tracking-wide text-[11px] text-text-muted min-w-[120px] relative">
                <div className="flex items-center gap-2">
                  <span>Remarks</span>
                  {showCourierRemarkFilters && (
                    <button
                      onClick={() => setRemarkFilter((f) => ({ ...f, open: !f.open }))}
                      className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"
                    >
                      <FilterIcon active={remarkFilter.hasRemark || remarkFilter.noRemark || !!remarkFilter.search.trim()} />
                    </button>
                  )}
                </div>
                {showCourierRemarkFilters && (
                  <FilterPopover
                    open={remarkFilter.open}
                    onClose={() => setRemarkFilter((f) => ({ ...f, open: false }))}
                    anchorRef={remarkRef}
                  >
                    <div className="space-y-3">
                      <p className="font-semibold text-text-primary text-sm">Filter Remarks</p>
                      <Input
                        placeholder="Search remark text..."
                        value={remarkFilter.search}
                        onChange={(e) => setRemarkFilter((f) => ({ ...f, search: e.target.value }))}
                        className="h-9 text-xs"
                      />
                      <label className="flex items-center gap-2 text-xs py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded accent-primary"
                          checked={remarkFilter.hasRemark}
                          onChange={() => setRemarkFilter((f) => ({ ...f, hasRemark: !f.hasRemark, noRemark: false }))}
                        />
                        Has remark
                      </label>
                      <label className="flex items-center gap-2 text-xs py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded accent-primary"
                          checked={remarkFilter.noRemark}
                          onChange={() => setRemarkFilter((f) => ({ ...f, noRemark: !f.noRemark, hasRemark: false }))}
                        />
                        No remark
                      </label>
                      <div className="flex justify-between pt-3 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs px-4"
                          onClick={() => setRemarkFilter({ open: false, search: "", hasRemark: false, noRemark: false })}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark"
                          onClick={() => setRemarkFilter((f) => ({ ...f, open: false }))}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </FilterPopover>
                )}
              </th>
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
              const orderTimestamp = orderTimestampForTab(o, activeTab);
              const visibleOrderNumber = displayOrderNumber(o);
              const shopifyOrderLabel = displayShopifyOrderLabel(o);
              return (
                <tr key={o.id} className={cn("border-b border-border last:border-0 align-top transition-colors hover:bg-surface-2/40", selected.has(o.id) && "bg-primary-light/30")}>
                  <td className="p-3 align-middle">
                    <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => onToggleSelect(o.id)} />
                  </td>

                  {/* Order Details */}
                  <td className="p-3">
                    <div className="relative">
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => (onViewOrder ? onViewOrder(o) : window.open(`/order-detail?id=${o.id}`, "_blank"))}
                          className="text-primary font-semibold text-sm hover:underline"
                        >
                          {visibleOrderNumber}
                        </button>
                        <div className="flex items-center gap-1 text-text-muted">
                          <Clock className="h-3 w-3" />
                          <span className="text-[11px]">{orderTimestamp.label}: {formatOrderTimestamp(orderTimestamp.date)}</span>
                        </div>
                        <p className="text-xs text-text-secondary">{shopifyOrderLabel}</p>
                        <div className="border-t border-border pt-1.5 mt-1.5">
                          <p className="text-xs"><span className="text-text-muted">Tag Status : </span><span className={cn("font-semibold", o.payment === "COD" ? "text-primary" : "text-success")}>{o.payment}</span></p>
                        </div>
                      </div>
                    </div>
                  </td>

                  {showStoreDetailsColumn && (
                    <td className="p-3 align-middle">
                      {channelLabel(o) === "Shopify" ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#96bf48]/15 text-[#5e8e3e] text-[10px] font-bold shrink-0">
                            S
                          </span>
                          <span className="text-xs font-semibold text-text-primary leading-tight">
                            {formatShopifyStoreLabel(o)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  )}

                  {/* Product Details */}
                  <td className="p-3">
                    <div className="relative min-w-[180px] max-w-[280px]">
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
                      <div className="pr-8 space-y-3">
                        {products.length > 0 ? products.map((p, pi) => {
                          const img = resolveOrderProductImage(o, p as { name?: string; productName?: string; sku?: string; imageUrl?: string }, pi);
                          return (
                            <div key={pi} className={cn(pi > 0 && "pt-3 border-t border-border/50")}>
                              <div className="flex gap-2.5">
                                <div className="h-14 w-14 rounded-lg border border-border/60 bg-surface-2 overflow-hidden shrink-0 shadow-sm">
                                  {img ? (
                                    <img src={img} alt={p.name || "Product"} className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                      <Package className="h-5 w-5 text-text-muted" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="text-[10px] text-text-muted uppercase tracking-wide">QTY: {p.qty ?? 1}</p>
                                  <ProductNameText product={{ name: p.name, productName: (p as any).productName }} compact />
                                </div>
                              </div>
                            </div>
                          );
                        }) : <p className="text-xs text-text-muted">No products</p>}
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
                        {!hideCustomerContact && o.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-text-muted shrink-0" />
                            <span className="text-[11px] text-text-primary">{o.phone}</span>
                          </div>
                        )}
                        {!hideCustomerContact && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-text-muted shrink-0" />
                          <a href={`mailto:${orderEmail}`} className="text-[11px] text-primary hover:underline">{orderEmail}</a>
                        </div>
                        )}
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
                        {displayShipmentStatusLabel(o)}
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
                  {showPickupColumn && (
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
                          <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditPickupOrder(o)}>
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
                                    {showProviderBrand ? `Velocity Linked ${pickupVelocityWh}` : "Shipping linked"}
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
                  )}

                  {/* Courier Details (conditional) - must come BEFORE Remarks to match header order */}
                  {(activeTab === "pending-pickup" || activeTab === "in-transit" || activeTab === "out-for-delivery" || activeTab === "delivered" || activeTab === "failed") && (
                    <td className="p-3">
                      {(() => {
                        const courierName = o.courier || (o as any).courierName || (o as any).courier_name || "-";
                        const rawEdd = (o as any).edd;
                        const eddDate = rawEdd ? new Date(rawEdd) : null;
                        const showEdd = activeTab !== "pending-pickup" && eddDate && !Number.isNaN(eddDate.getTime());
                        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const eddStr = showEdd ? `${eddDate.getDate()} ${months[eddDate.getMonth()]} '${String(eddDate.getFullYear()).slice(2)}` : "";
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Truck className="h-3 w-3 text-text-muted shrink-0" />
                              <p className="text-xs font-semibold text-text-primary">{courierName}</p>
                            </div>
                            {showEdd && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3 text-text-muted shrink-0" />
                                <span className="text-[11px] text-text-secondary">EDD: {eddStr}</span>
                              </div>
                            )}
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
                            onBlur={() => {
                              setEditingRemark(null);
                              void handleRemarkSave(o.id, remarks[o.id] ?? "");
                            }}
                            disabled={savingRemarkId === o.id}
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-text-secondary hover:text-primary hover:bg-primary-light"
                            onClick={() => window.open(`/order-detail?id=${encodeURIComponent(o.id)}`, "_blank")}
                            title="View order details in new tab"
                          >
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
                      ) : POST_READY_TABS.has(activeTab ?? "") && onMarkReship ? (
                        <Button variant="outline" size="sm"
                          className="h-7 text-xs gap-1 border-warning/40 text-warning hover:bg-warning-light"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setReshipConfirmId(o.id); }}>
                          <XCircle className="h-3 w-3" /> Cancel
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {!o.isJunk && !isOrderReadyToShip(o) && onMoveToReady && activeTab !== "ready-to-ship" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-green-500/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                              onClick={async (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                await onMoveToReady(o.id);
                              }}
                            >
                              <Truck className="h-3 w-3" /> Move To Ready
                            </Button>
                          )}
                          {!o.isJunk && (
                            <Button variant="outline" size="sm"
                              className="h-7 text-xs gap-1 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark"
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setJunkConfirmId(o.id); }}>
                              <Ban className="h-3 w-3" /> Junk
                            </Button>
                          )}
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
      </div>

      <div className="h-14 shrink-0" aria-hidden />

      <div
        className="fixed bottom-0 z-30 border-t border-border/60 bg-card/90 backdrop-blur-sm left-0 right-0 pb-[env(safe-area-inset-bottom,0px)] max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:left-[var(--sidebar-width,4.5rem)] transition-[left] duration-300"
      >
        <div className="px-4 py-2.5 text-sm text-text-secondary">
          Showing 1–{filteredOrders.length} of {filteredOrders.length} orders
        </div>
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
        onSaved={() => void refreshOrders()}
      />

      {/* Edit Price Modal */}
      {editPriceOrder && (
        <EditPriceModal open={!!editPriceOrder} onClose={() => setEditPriceOrder(null)} order={editPriceOrder} onSave={handleEditPriceSave} />
      )}

      {/* Edit Address Modal */}
      {editAddressOrder && (
        <EditAddressModal open={!!editAddressOrder} onClose={() => setEditAddressOrder(null)} order={editAddressOrder} onSave={handleEditAddressSave} />
      )}

      {editPickupOrder && (
        <EditPickupModal
          open={!!editPickupOrder}
          onClose={() => setEditPickupOrder(null)}
          order={editPickupOrder}
          warehouses={warehouses.map((w) => ({ id: w.id, warehouseName: w.warehouseName }))}
          onSave={handleEditPickupSave}
        />
      )}

      {/* Reship (Cancel) Confirmation Dialog */}
      <AlertDialog open={!!reshipConfirmId} onOpenChange={(open) => !open && setReshipConfirmId(null)}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogDescription className="text-sm text-text-primary">
              Cancel this shipment with the courier and move the order to Reship? The courier will be notified so they do not attempt pickup. You can edit and re-process from the Reship tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:gap-3">
            <AlertDialogCancel className="border-none shadow-none text-text-secondary hover:text-text-primary">No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary-dark"
              onClick={() => { if (reshipConfirmId && onMarkReship) { onMarkReship(reshipConfirmId); setReshipConfirmId(null); } }}>
              Yes, Move to Reship
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                      {showProviderBrand ? "Velocity needs" : "The shipping provider needs"} a full delivery address, pincode, weight, and dimensions. Fix these before creating a shipment.
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
                      {showProviderBrand ? "Order linked to Velocity warehouse:" : "Order linked to shipping warehouse:"}{" "}
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
                            {!vid ? (showProviderBrand ? " (not Velocity-linked)" : " (not linked)") : ""}
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
                <option value="">Auto — {showProviderBrand ? "Velocity assigns" : "system assigns"} best carrier</option>
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
                {couriersLoading ? (showProviderBrand ? "Loading Velocity couriers…" : "Loading couriers…") : "Choose Auto or pick a specific courier for this shipment."}
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
                  toast.error(showProviderBrand ? "Selected pickup is not linked to Velocity" : "Selected pickup is not linked for shipping");
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
                    d.shipment_id && `${showProviderBrand ? "Velocity shipment" : "Shipment"}: ${d.shipment_id}`,
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
