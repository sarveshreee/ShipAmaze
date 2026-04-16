import { useState, useRef, useEffect } from "react";
import { type Order } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Printer, Ban, Pencil, SlidersHorizontal, X, MapPin, Phone, Mail, Package, Monitor, Download, Settings, CheckSquare, Save, Clock, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { printShippingLabel } from "@/components/ShippingLabel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

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
    <div ref={ref} className="absolute z-50 top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px] max-h-[400px] overflow-auto">
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
function EditAddressModal({ open, onClose, order, onSave }: { open: boolean; onClose: () => void; order: Order; onSave: (id: string, data: any) => void }) {
  const [form, setForm] = useState({ customerName: "", customerEmail: "", customerNumber: "", customerNumber2: "", address1: "", address2: "", pincode: "", city: "", state: "" });

  useEffect(() => {
    if (open && order) {
      const email = (order as any).email || `${order.customer.toLowerCase().replace(/\s/g, '')}@email.com`;
      setForm({
        customerName: order.customer || "",
        customerEmail: email,
        customerNumber: order.phone || "",
        customerNumber2: (order as any).phone2 || "",
        address1: order.address || "",
        address2: (order as any).address2 || "",
        pincode: order.pincode || "",
        city: order.city || "",
        state: (order as any).state || "",
      });
    }
  }, [open, order]);

  const handleSubmit = () => {
    onSave(order.id, form);
    onClose();
    toast.success("Order details updated");
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
}

export function RichOrdersTable({ orders, selected, onToggleSelect, onSelectAll, onClearSelection, onMarkJunk, onBulkJunk, onOpenProcessModal, onExport, loading, activeTab, onToggleSidebar }: Props) {
  const [productFilter, setProductFilter] = useState({ open: false, search: "", mode: "AND" as "OR"|"AND"|"NOT", selectedNames: new Set<string>() });
  const [amountFilter, setAmountFilter] = useState({ open: false, from: "", to: "" });
  const [addressFilter, setAddressFilter] = useState({ open: false, search: "", selectedStates: new Set<string>(), validPincodes: false, invalidPincodes: false, invalidContact: false });
  const [commFilter, setCommFilter] = useState({ open: false, ivrSelected: new Set<string>(), whatsappSelected: new Set<string>() });

  const productRef = useRef<HTMLTableCellElement>(null);
  const amountRef = useRef<HTMLTableCellElement>(null);
  const addressRef = useRef<HTMLTableCellElement>(null);
  const commRef = useRef<HTMLTableCellElement>(null);

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [editingRemark, setEditingRemark] = useState<string | null>(null);
  const [junkConfirmId, setJunkConfirmId] = useState<string | null>(null);

  // Edit modals
  const [editProductOrder, setEditProductOrder] = useState<Order | null>(null);
  const [editPriceOrder, setEditPriceOrder] = useState<Order | null>(null);
  const [editAddressOrder, setEditAddressOrder] = useState<Order | null>(null);

  const allProductNames = Array.from(new Set(orders.flatMap(o => (o.products || []).map(p => p.name))));

  const filteredOrders = orders.filter(o => {
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
    if (amountFilter.from && o.amount < Number(amountFilter.from)) return false;
    if (amountFilter.to && o.amount > Number(amountFilter.to)) return false;
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
    return true;
  });

  const isValidPincode = (pin: string | undefined) => pin != null && /^\d{6}$/.test(pin);

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

  const handleEditAddressSave = (orderId: string, data: any) => {
    const stored = JSON.parse(localStorage.getItem("shipflow_orders") || "[]");
    const updated = stored.map((o: any) => {
      if (o.id === orderId || o.orderId === orderId || o.order_id === orderId) {
        return { ...o, customer: data.customerName, email: data.customerEmail, phone: data.customerNumber, phone2: data.customerNumber2, address: data.address1, address2: data.address2, pincode: data.pincode, city: data.city, state: data.state };
      }
      return o;
    });
    localStorage.setItem("shipflow_orders", JSON.stringify(updated));
  };

  const toggleCommSet = (set: Set<string>, item: string) => {
    const n = new Set(set); n.has(item) ? n.delete(item) : n.add(item); return n;
  };

  const FilterIcon = ({ active }: { active: boolean }) => (
    <SlidersHorizontal className={cn("h-3.5 w-3.5 transition-colors", active ? "text-primary" : "text-text-muted")} />
  );

  return (
    <div className="rounded-lg bg-card shadow-card overflow-hidden">
      {/* Action bar when orders are selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-surface-2/80 border-b border-border flex-wrap">
          <button onClick={onToggleSidebar} className="p-1.5 rounded-md hover:bg-surface-2 transition-colors" title="Toggle sidebar">
            <Monitor className="h-4 w-4 text-primary" />
          </button>
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <span>Count Order: <strong>{selected.size}</strong></span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left w-10 border-r border-border">
                <input type="checkbox" className="rounded border-border accent-primary"
                  checked={selected.size === filteredOrders.length && filteredOrders.length > 0}
                  onChange={e => e.target.checked ? onSelectAll(filteredOrders.map(o => o.id)) : onClearSelection()} />
              </th>
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span>Order Details</span>
                  <button className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"><FilterIcon active={false} /></button>
                </div>
              </th>
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span>Products Details</span>
                  <button className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"><FilterIcon active={false} /></button>
                </div>
              </th>
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span>Customer Details</span>
                  <button className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"><FilterIcon active={false} /></button>
                </div>
              </th>
              <th ref={amountRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[140px] relative">
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
              <th ref={addressRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[220px] relative">
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
                              const n = new Set(f.selectedStates); n.has(state) ? n.delete(state) : n.add(state); return { ...f, selectedStates: n };
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
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[120px]">Remarks</th>
              <th ref={commRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[130px] relative">
                <div className="flex items-center gap-2">
                  <span>Communication</span>
                  <button onClick={() => setCommFilter(f => ({ ...f, open: !f.open }))}
                    className="p-1.5 rounded-md hover:bg-surface-2 transition-colors">
                    <FilterIcon active={commFilter.ivrSelected.size > 0 || commFilter.whatsappSelected.size > 0} />
                  </button>
                </div>
                <FilterPopover open={commFilter.open} onClose={() => setCommFilter(f => ({ ...f, open: false }))} anchorRef={commRef}>
                  <div className="space-y-3 min-w-[340px]">
                    {/* IVR Section */}
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-text-primary text-sm">IVR</p>
                      <button className="text-xs text-primary font-semibold hover:underline" onClick={() => setCommFilter(f => ({ ...f, ivrSelected: new Set(IVR_OPTIONS) }))}>Select All</button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {IVR_OPTIONS.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1">
                          <input type="checkbox" className="rounded accent-primary" checked={commFilter.ivrSelected.has(opt)}
                            onChange={() => setCommFilter(f => ({ ...f, ivrSelected: toggleCommSet(f.ivrSelected, opt) }))} />
                          {opt}
                        </label>
                      ))}
                    </div>

                    {/* Red divider */}
                    <div className="border-t-2 border-danger my-2" />

                    {/* WhatsApp Section */}
                    <p className="font-semibold text-text-primary text-sm">Whatsapp</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {WHATSAPP_OPTIONS.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer hover:bg-surface-2/50 rounded px-1">
                          <input type="checkbox" className="rounded accent-primary" checked={commFilter.whatsappSelected.has(opt)}
                            onChange={() => setCommFilter(f => ({ ...f, whatsappSelected: toggleCommSet(f.whatsappSelected, opt) }))} />
                          {opt}
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-between pt-3 border-t border-border">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setCommFilter({ open: false, ivrSelected: new Set(), whatsappSelected: new Set() })}>Clear</Button>
                      <Button size="sm" className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setCommFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th className="p-3 text-center font-medium text-text-secondary min-w-[130px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="p-4 border-r border-border last:border-r-0"><div className="h-4 bg-surface-2 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={10} className="p-12 text-center text-text-muted">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No orders found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </td></tr>
            ) : filteredOrders.map(o => {
              const products = o.products || [];
            const orderEmail = (o as any).email || `${(o.customer || '').toLowerCase().replace(/\s/g, '')}@email.com`;
              return (
                <tr key={o.id} className={cn("border-b border-border last:border-0 align-top transition-colors", selected.has(o.id) && "bg-primary-light/30")}>
                  <td className="p-3 border-r border-border align-middle">
                    <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => onToggleSelect(o.id)} />
                  </td>

                  {/* Order Details - redesigned per image 3 */}
                  <td className="p-3 border-r border-border">
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
                  </td>

                  {/* Products Details - no package icons */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute top-0 right-0 p-1 rounded hover:bg-primary-light transition-colors" onClick={() => setEditProductOrder(o)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      {products.length > 0 ? products.map((p, pi) => (
                        <div key={pi} className={cn("pb-2", pi > 0 && "pt-2 border-t border-border/50")}>
                          <div className="flex justify-between text-[11px] text-text-muted mb-1 pr-6">
                            <span>SKU: {(p as any).sku || `SKU-${pi + 1}`}</span>
                            <span>QTY: {p.qty?.toFixed?.(2) ?? p.qty}</span>
                          </div>
                          <p className="text-xs text-text-primary leading-snug">{p.name}</p>
                        </div>
                      )) : <p className="text-xs text-text-muted">No products</p>}
                    </div>
                  </td>

                  {/* Customer Details - full consignee info */}
                  <td className="p-3 border-r border-border">
                    <div className="space-y-1.5">
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
                  </td>

                  {/* Amount Details - fix #2: pencil at top-right, not overlapping */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditPriceOrder(o)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      <div className="space-y-1 pr-6">
                        <p className="text-xs"><span className="text-text-muted">Order Amt.: </span><span className="text-text-primary font-medium">{o.amount.toFixed(2)}</span></p>
                        {o.payment === "COD" && (
                          <p className="text-xs"><span className="text-text-muted">COD Amt.: </span><span className="text-text-primary font-medium">{o.amount.toFixed(2)}</span></p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Pickup Address */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute -top-1 -right-1 p-1 rounded hover:bg-primary-light transition-colors z-10" onClick={() => setEditAddressOrder(o)}>
                        <Pencil className="h-3 w-3 text-primary" />
                      </button>
                      <div className="space-y-1.5 pr-6">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <div className="text-[11px] text-text-secondary leading-snug">
                            <p className="text-xs font-medium text-text-primary">{o.city || "–"}</p>
                            <p>{(o as any).pickup_address || o.address || ''}</p>
                            {(o as any).address2 && <p>{(o as any).address2}</p>}
                            <p>
                              {isValidPincode(o.pincode) ? (
                                <span className="font-medium text-success">{o.pincode}</span>
                              ) : (
                                <span className="font-medium text-danger">{o.pincode || "N/A"}</span>
                              )}
                              <span className="text-text-muted"> – {(o as any).state || o.city}</span>
                            </p>
                          </div>
                        </div>
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

                  {/* Remarks */}
                  <td className="p-3 border-r border-border">
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

                  {/* Communication */}
                  <td className="p-3 border-r border-border">
                    <span className="text-xs text-text-muted"></span>
                  </td>

                  {/* Action */}
                  <td className="p-3 align-middle">
                    <div className="flex flex-col items-center gap-2">
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
                      {activeTab === "junk" ? (
                        <Button variant="outline" size="sm"
                          className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary-light"
                          onClick={() => {
                            // Navigate to Add Order with this order's data pre-filled
                            const orderData = encodeURIComponent(JSON.stringify(o));
                            window.location.href = `/dropshipper/add-order?edit=${o.id}`;
                          }}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm"
                          className="h-7 text-xs gap-1 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setJunkConfirmId(o.id); }}>
                          <Ban className="h-3 w-3" /> Junk
                        </Button>
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
              Are you sure! You want to cancel this order? This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:gap-3">
            <AlertDialogCancel className="border-none shadow-none text-text-secondary hover:text-text-primary">No</AlertDialogCancel>
            <AlertDialogAction
              className="border border-primary text-primary bg-transparent hover:bg-primary-light"
              onClick={() => { if (junkConfirmId) { onMarkJunk(junkConfirmId); setJunkConfirmId(null); } }}>
              Yes, Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
