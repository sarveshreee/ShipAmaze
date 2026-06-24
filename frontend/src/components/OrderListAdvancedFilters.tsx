import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OrderListFilterValues } from "@/services/orderService";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "draft", label: "Draft" },
  { value: "ready-to-ship", label: "Ready to ship" },
  { value: "ready_to_ship", label: "Ready to ship (alt)" },
  { value: "pending-pickup", label: "Pending pickup" },
  { value: "pending_pickup", label: "Pending pickup (alt)" },
  { value: "pickup_scheduled", label: "Pickup scheduled" },
  { value: "not-picked", label: "Not picked" },
  { value: "in-transit", label: "In transit" },
  { value: "in_transit", label: "In transit (alt)" },
  { value: "shipped", label: "Shipped" },
  { value: "out-for-delivery", label: "Out for delivery" },
  { value: "out_for_delivery", label: "Out for delivery (alt)" },
  { value: "delivered", label: "Delivered" },
  { value: "ndr", label: "NDR" },
  { value: "rto", label: "RTO" },
  { value: "cancelled", label: "Cancelled" },
  { value: "reship", label: "Reship" },
  { value: "failed", label: "Failed" },
  { value: "junk", label: "Junk" },
  { value: "on-process", label: "On process" },
];

const emptyDraft: OrderListFilterValues = {
  status: "",
  payment: "",
  courier: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  customerCity: "",
  customerState: "",
  pickupCity: "",
  pickupState: "",
  productSku: "",
  productName: "",
  amountMin: "",
  amountMax: "",
  hasAwb: "",
  shipmentCreated: "",
  dropshipperId: "",
  vendorId: "",
};

export type CourierOption = { id: string; name: string };
export type OwnerFilterOption = { id: string; label: string };

interface OrderListAdvancedFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: OrderListFilterValues;
  onApply: (next: OrderListFilterValues) => void;
  couriers: CourierOption[];
  dropshippers?: OwnerFilterOption[];
  vendors?: OwnerFilterOption[];
  /** When true, payment is controlled elsewhere (e.g. Channel tab). */
  hidePayment?: boolean;
}

export function OrderListAdvancedFilters({
  open,
  onOpenChange,
  value,
  onApply,
  couriers,
  dropshippers = [],
  vendors = [],
  hidePayment,
}: OrderListAdvancedFiltersProps) {
  const [draft, setDraft] = useState<OrderListFilterValues>(emptyDraft);

  useEffect(() => {
    if (open) {
      setDraft({
        ...emptyDraft,
        ...value,
        status: value.status ?? "",
        payment: value.payment ?? "",
        courier: value.courier ?? "",
        source: value.source ?? "",
        dateFrom: value.dateFrom ?? "",
        dateTo: value.dateTo ?? "",
        customerCity: value.customerCity ?? "",
        customerState: value.customerState ?? "",
        pickupCity: value.pickupCity ?? "",
        pickupState: value.pickupState ?? "",
        productSku: value.productSku ?? "",
        productName: value.productName ?? "",
        amountMin: value.amountMin ?? "",
        amountMax: value.amountMax ?? "",
        hasAwb: value.hasAwb ?? "",
        shipmentCreated: value.shipmentCreated ?? "",
        dropshipperId: value.dropshipperId ?? "",
        vendorId: value.vendorId ?? "",
      });
    }
  }, [open, value]);

  const setField = <K extends keyof OrderListFilterValues>(key: K, v: OrderListFilterValues[K]) => {
    setDraft((d) => ({ ...d, [key]: v }));
  };

  const handleApply = () => {
    onApply(draft);
    onOpenChange(false);
  };

  const handleResetDraft = () => setDraft(emptyDraft);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 pb-2 border-b border-border shrink-0 text-left">
          <SheetTitle>Advanced filters</SheetTitle>
          <SheetDescription>
            Narrow orders by logistics fields. Filters apply together with the current tab and search.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4 pb-24">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={draft.status || "__any__"} onValueChange={(v) => setField("status", v === "__any__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any status</SelectItem>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!hidePayment && (
              <div className="space-y-2">
                <Label>Payment</Label>
                <Select
                  value={draft.payment || "__any__"}
                  onValueChange={(v) => setField("payment", v === "__any__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any payment</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="Prepaid">Prepaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Courier</Label>
              <Select value={draft.courier || "__any__"} onValueChange={(v) => setField("courier", v === "__any__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any courier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any courier</SelectItem>
                  {couriers
                    .filter((c) => c.name?.trim())
                    .map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={draft.source || "__any__"} onValueChange={(v) => setField("source", v === "__any__" ? "" : (v as OrderListFilterValues["source"]))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any source</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="channel">Channel (Shopify)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dropshipper</Label>
                <Select value={draft.dropshipperId || "__any__"} onValueChange={(v) => setField("dropshipperId", v === "__any__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any dropshipper" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any dropshipper</SelectItem>
                    {dropshippers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={draft.vendorId || "__any__"} onValueChange={(v) => setField("vendorId", v === "__any__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any vendor</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From date</Label>
                <Input type="date" value={draft.dateFrom} onChange={(e) => setField("dateFrom", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To date</Label>
                <Input type="date" value={draft.dateTo} onChange={(e) => setField("dateTo", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Customer city</Label>
                <Input value={draft.customerCity} onChange={(e) => setField("customerCity", e.target.value)} placeholder="Partial match" />
              </div>
              <div className="space-y-2">
                <Label>Customer state</Label>
                <Input value={draft.customerState} onChange={(e) => setField("customerState", e.target.value)} placeholder="Partial match" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Pickup city</Label>
                <Input value={draft.pickupCity} onChange={(e) => setField("pickupCity", e.target.value)} placeholder="Saved pickup" />
              </div>
              <div className="space-y-2">
                <Label>Pickup state</Label>
                <Input value={draft.pickupState} onChange={(e) => setField("pickupState", e.target.value)} placeholder="Saved pickup" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Product name</Label>
              <Input value={draft.productName} onChange={(e) => setField("productName", e.target.value)} placeholder="Partial match on line items" />
            </div>
            <div className="space-y-2">
              <Label>Product SKU</Label>
              <Input value={draft.productSku} onChange={(e) => setField("productSku", e.target.value)} placeholder="Partial match on line items" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min amount (₹)</Label>
                <Input inputMode="decimal" value={draft.amountMin} onChange={(e) => setField("amountMin", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Max amount (₹)</Label>
                <Input inputMode="decimal" value={draft.amountMax} onChange={(e) => setField("amountMax", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Has AWB</Label>
                <Select
                  value={draft.hasAwb || "__any__"}
                  onValueChange={(v) => setField("hasAwb", v === "__any__" ? "" : (v as OrderListFilterValues["hasAwb"]))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shipment created</Label>
                <Select
                  value={draft.shipmentCreated || "__any__"}
                  onValueChange={(v) =>
                    setField("shipmentCreated", v === "__any__" ? "" : (v as OrderListFilterValues["shipmentCreated"]))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="p-4 border-t border-border bg-card flex-row flex-wrap gap-2 shrink-0">
          <Button type="button" variant="outline" onClick={handleResetDraft}>
            Reset form
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={handleApply}>
            Apply filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
