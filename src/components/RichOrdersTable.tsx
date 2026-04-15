import { useState, useRef, useEffect } from "react";
import { type Order } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Printer, Ban, Pencil, ChevronDown, X, MapPin, Phone, Mail, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { printShippingLabel } from "@/components/ShippingLabel";

const INDIAN_STATES = [
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chandigarh","Chhattisgarh","Dadra and Nagar Haveli","Daman and Diu","Delhi","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka",
  "Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya",
  "Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu",
  "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"
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
    <div ref={ref} className="absolute z-50 top-full right-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-4 min-w-[260px] max-h-[400px] overflow-auto">
      {children}
    </div>
  );
}

interface Props {
  orders: Order[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onMarkJunk: (id: string) => void;
  loading: boolean;
}

export function RichOrdersTable({ orders, selected, onToggleSelect, onSelectAll, onClearSelection, onMarkJunk, loading }: Props) {
  // Filter states
  const [productFilter, setProductFilter] = useState({ open: false, search: "", mode: "AND" as "OR"|"AND"|"NOT", selectedNames: new Set<string>() });
  const [amountFilter, setAmountFilter] = useState({ open: false, from: "", to: "" });
  const [addressFilter, setAddressFilter] = useState({ open: false, search: "", selectedStates: new Set<string>(), validPincodes: false, invalidPincodes: false, invalidContact: false });
  const [commFilter, setCommFilter] = useState({ open: false });

  // Refs for filter anchors
  const productRef = useRef<HTMLTableCellElement>(null);
  const amountRef = useRef<HTMLTableCellElement>(null);
  const addressRef = useRef<HTMLTableCellElement>(null);
  const commRef = useRef<HTMLTableCellElement>(null);

  // Remarks editing
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [editingRemark, setEditingRemark] = useState<string | null>(null);

  // Get unique product names
  const allProductNames = Array.from(new Set(orders.flatMap(o => (o.products || []).map(p => p.name))));
  const allSkus = Array.from(new Set(orders.flatMap(o => (o.products || []).map((_, i) => `SKU-${i + 1}`))));

  // Apply filters
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
    return true;
  });

  const isValidPincode = (pin: string | undefined) => pin != null && /^\d{6}$/.test(pin);

  return (
    <div className="rounded-lg bg-card shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left w-10 border-r border-border">
                <input type="checkbox" className="rounded border-border accent-primary"
                  checked={selected.size === filteredOrders.length && filteredOrders.length > 0}
                  onChange={e => e.target.checked ? onSelectAll(filteredOrders.map(o => o.id)) : onClearSelection()} />
              </th>
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[180px]">Order Details</th>
              <th ref={productRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[200px] relative">
                <div className="flex items-center justify-between">
                  <span>Products Details</span>
                  <button onClick={() => setProductFilter(f => ({ ...f, open: !f.open }))} className="p-1 hover:bg-surface-2 rounded">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-text-muted", productFilter.selectedNames.size > 0 && "text-primary")} />
                  </button>
                </div>
                <FilterPopover open={productFilter.open} onClose={() => setProductFilter(f => ({ ...f, open: false }))} anchorRef={productRef}>
                  <div className="space-y-3">
                    <p className="font-medium text-text-primary text-sm">Product Name:</p>
                    <div className="flex gap-1 mb-2">
                      {(["OR","AND","NOT"] as const).map(m => (
                        <button key={m} onClick={() => setProductFilter(f => ({ ...f, mode: m }))}
                          className={cn("px-2.5 py-1 text-xs font-medium rounded", productFilter.mode === m ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text-secondary")}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <Input placeholder="Search" value={productFilter.search} onChange={e => setProductFilter(f => ({ ...f, search: e.target.value }))} className="h-8 text-xs" />
                    <div className="max-h-[150px] overflow-auto space-y-1">
                      {allProductNames.filter(n => n.toLowerCase().includes(productFilter.search.toLowerCase())).map(name => (
                        <label key={name} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                          <input type="checkbox" className="rounded accent-primary" checked={productFilter.selectedNames.has(name)}
                            onChange={() => setProductFilter(f => {
                              const n = new Set(f.selectedNames); n.has(name) ? n.delete(name) : n.add(name); return { ...f, selectedNames: n };
                            })} />
                          {name}
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setProductFilter(f => ({ ...f, selectedNames: new Set(), open: false }))}>Clear</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => setProductFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th ref={amountRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[140px] relative">
                <div className="flex items-center justify-between">
                  <span>Amount Details</span>
                  <button onClick={() => setAmountFilter(f => ({ ...f, open: !f.open }))} className="p-1 hover:bg-surface-2 rounded">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-text-muted", (amountFilter.from || amountFilter.to) && "text-primary")} />
                  </button>
                </div>
                <FilterPopover open={amountFilter.open} onClose={() => setAmountFilter(f => ({ ...f, open: false }))} anchorRef={amountRef}>
                  <div className="space-y-3">
                    <p className="font-medium text-text-primary text-sm">Amount</p>
                    <Input placeholder="From" type="number" value={amountFilter.from} onChange={e => setAmountFilter(f => ({ ...f, from: e.target.value }))} className="h-8 text-xs" />
                    <Input placeholder="To" type="number" value={amountFilter.to} onChange={e => setAmountFilter(f => ({ ...f, to: e.target.value }))} className="h-8 text-xs" />
                    <div className="flex justify-between pt-2 border-t border-border">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAmountFilter({ open: false, from: "", to: "" })}>Clear</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => setAmountFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th ref={addressRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[220px] relative">
                <div className="flex items-center justify-between">
                  <span>Address</span>
                  <button onClick={() => setAddressFilter(f => ({ ...f, open: !f.open }))} className="p-1 hover:bg-surface-2 rounded">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-text-muted", (addressFilter.selectedStates.size > 0 || addressFilter.validPincodes || addressFilter.invalidPincodes || addressFilter.invalidContact) && "text-primary")} />
                  </button>
                </div>
                <FilterPopover open={addressFilter.open} onClose={() => setAddressFilter(f => ({ ...f, open: false }))} anchorRef={addressRef}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text-primary text-sm">States</p>
                      <button className="text-xs text-primary font-medium" onClick={() => setAddressFilter(f => ({ ...f, selectedStates: new Set(INDIAN_STATES) }))}>Select All</button>
                    </div>
                    <Input placeholder="Search State" value={addressFilter.search} onChange={e => setAddressFilter(f => ({ ...f, search: e.target.value }))} className="h-8 text-xs" />
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                        <input type="checkbox" className="rounded accent-primary" checked={addressFilter.validPincodes}
                          onChange={() => setAddressFilter(f => ({ ...f, validPincodes: !f.validPincodes, invalidPincodes: false }))} />
                        Valid Pincodes
                      </label>
                      <label className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                        <input type="checkbox" className="rounded accent-primary" checked={addressFilter.invalidPincodes}
                          onChange={() => setAddressFilter(f => ({ ...f, invalidPincodes: !f.invalidPincodes, validPincodes: false }))} />
                        Invalid Pincodes
                      </label>
                      <label className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                        <input type="checkbox" className="rounded accent-primary" checked={addressFilter.invalidContact}
                          onChange={() => setAddressFilter(f => ({ ...f, invalidContact: !f.invalidContact }))} />
                        Invalid Contact No.
                      </label>
                    </div>
                    <div className="max-h-[150px] overflow-auto space-y-1 border-t border-border pt-2">
                      {INDIAN_STATES.filter(s => s.toLowerCase().includes(addressFilter.search.toLowerCase())).map(state => (
                        <label key={state} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                          <input type="checkbox" className="rounded accent-primary" checked={addressFilter.selectedStates.has(state)}
                            onChange={() => setAddressFilter(f => {
                              const n = new Set(f.selectedStates); n.has(state) ? n.delete(state) : n.add(state); return { ...f, selectedStates: n };
                            })} />
                          {state}
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddressFilter({ open: false, search: "", selectedStates: new Set(), validPincodes: false, invalidPincodes: false, invalidContact: false })}>Clear</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => setAddressFilter(f => ({ ...f, open: false }))}>Apply</Button>
                    </div>
                  </div>
                </FilterPopover>
              </th>
              <th className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[120px]">Remarks</th>
              <th ref={commRef} className="p-3 text-left font-medium text-text-secondary border-r border-border min-w-[130px] relative">
                <div className="flex items-center justify-between">
                  <span>Communication</span>
                  <button onClick={() => setCommFilter(f => ({ ...f, open: !f.open }))} className="p-1 hover:bg-surface-2 rounded">
                    <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                  </button>
                </div>
                <FilterPopover open={commFilter.open} onClose={() => setCommFilter(f => ({ ...f, open: false }))} anchorRef={commRef}>
                  <p className="text-xs text-text-muted">No filters available yet.</p>
                </FilterPopover>
              </th>
              <th className="p-3 text-center font-medium text-text-secondary min-w-[130px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="p-4 border-r border-border last:border-r-0"><div className="h-4 bg-surface-2 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={8} className="p-12 text-center text-text-muted">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No orders found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </td></tr>
            ) : filteredOrders.map(o => {
              const products = o.products || [];
              const orderEmail = `${o.customer.toLowerCase().replace(/\s/g, '')}@email.com`;
              return (
                <tr key={o.id} className={cn("border-b border-border last:border-0 align-top transition-colors", selected.has(o.id) && "bg-primary-light/30")}>
                  {/* Checkbox */}
                  <td className="p-3 border-r border-border align-middle">
                    <input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => onToggleSelect(o.id)} />
                  </td>

                  {/* Order Details */}
                  <td className="p-3 border-r border-border">
                    <div className="space-y-1">
                      <button onClick={() => window.open(`/order-detail?id=${o.id}`, '_blank')} className="text-primary font-medium text-xs hover:underline font-mono">{o.id}</button>
                      <p className="text-[11px] text-text-muted">{o.date}</p>
                      <p className="text-xs text-text-secondary">Order #{o.id.replace(/\D/g, '') || o.id}</p>
                    </div>
                  </td>

                  {/* Products Details */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute top-0 right-0 text-primary hover:text-primary-dark"><Pencil className="h-3 w-3" /></button>
                      {products.length > 0 ? products.map((p, pi) => (
                        <div key={pi} className={cn("pb-2", pi > 0 && "pt-2 border-t border-border/50")}>
                          <div className="flex justify-between text-[11px] text-text-muted mb-1">
                            <span>SKU: {(p as any).sku || `SKU-${pi + 1}`}</span>
                            <span>QTY: {p.qty.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-text-primary leading-snug">{p.name}</p>
                          <div className="mt-1.5 h-10 w-10 rounded bg-surface-2 flex items-center justify-center">
                            <Package className="h-4 w-4 text-text-muted" />
                          </div>
                        </div>
                      )) : <p className="text-xs text-text-muted">No products</p>}
                    </div>
                  </td>

                  {/* Amount Details */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute top-0 right-0 text-primary hover:text-primary-dark"><Pencil className="h-3 w-3" /></button>
                      <div className="space-y-1 pr-4">
                        <p className="text-xs"><span className="text-text-muted">Order Amt.: </span><span className="text-text-primary font-medium">{o.amount.toFixed(2)}</span></p>
                        {o.payment === "COD" && (
                          <p className="text-xs"><span className="text-text-muted">COD Amt.: </span><span className="text-text-primary font-medium">{o.amount.toFixed(2)}</span></p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Address */}
                  <td className="p-3 border-r border-border">
                    <div className="relative">
                      <button className="absolute top-0 right-0 text-primary hover:text-primary-dark"><Pencil className="h-3 w-3" /></button>
                      <div className="space-y-1 pr-4">
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-text-primary">{o.customer} –</p>
                            <p className="text-[11px] text-text-secondary leading-snug">{o.address}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isValidPincode(o.pincode) ? (
                                <span className="text-[11px] font-medium text-success">{o.pincode}</span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-[11px] font-medium text-danger">
                                  <X className="h-3 w-3" />{o.pincode || "N/A"}
                                </span>
                              )}
                              <span className="text-[11px] text-text-muted">– {o.city}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3 text-primary shrink-0" />
                          <span className="text-[11px] text-primary">{o.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-primary shrink-0" />
                          <span className="text-[11px] text-primary">{orderEmail}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Remarks */}
                  <td className="p-3 border-r border-border">
                    <div className="relative min-h-[40px]">
                      <button className="absolute top-0 right-0 text-primary hover:text-primary-dark" onClick={() => setEditingRemark(editingRemark === o.id ? null : o.id)}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      {editingRemark === o.id ? (
                        <div className="pr-4">
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
                        <p className="text-xs text-text-muted pr-4">{remarks[o.id] || ""}</p>
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
                      <Button variant="outline" size="sm"
                        className="h-7 text-xs gap-1 border-danger/40 text-danger hover:bg-danger-light hover:text-danger-dark"
                        onClick={(e) => { e.stopPropagation(); onMarkJunk(o.id); }}>
                        <Ban className="h-3 w-3" /> Junk
                      </Button>
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
    </div>
  );
}
