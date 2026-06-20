import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Warehouse } from "@/hooks/useVendorWarehouses";
import {
  restrictCourierPersonNameInput,
  restrictCourierWarehouseNameInput,
} from "@/lib/courierNameInput";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Warehouse | null;
  onSubmit: (data: Omit<Warehouse, "id" | "vendorId" | "vendorName" | "createdAt" | "updatedAt">) => void;
}

const empty = {
  warehouseName: "",
  contactPerson: "",
  phoneNumber: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  warehouseType: "B2B Warehouse",
  status: "Active" as "Active" | "Inactive",
  isDefault: false,
  gstNumber: "",
  notes: "",
};

export default function WarehouseFormModal({ open, onOpenChange, initial, onSubmit }: Props) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (initial) {
      setForm({
        warehouseName: initial.warehouseName,
        contactPerson: initial.contactPerson,
        phoneNumber: initial.phoneNumber,
        email: initial.email,
        addressLine1: initial.addressLine1,
        addressLine2: initial.addressLine2 || "",
        landmark: initial.landmark || "",
        city: initial.city,
        state: initial.state,
        pincode: initial.pincode,
        country: initial.country,
        warehouseType: initial.warehouseType,
        status: initial.status,
        isDefault: !!initial.isDefault,
        gstNumber: initial.gstNumber || "",
        notes: initial.notes || "",
      });
    } else if (open) {
      setForm(empty);
    }
  }, [initial, open]);

  const set = (k: keyof typeof empty, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): string | null => {
    if (!form.warehouseName.trim()) return "Warehouse name is required";
    if (!form.contactPerson.trim()) return "Contact person is required";
    if (!/^\d{10}$/.test(form.phoneNumber)) return "Phone must be 10 digits";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email";
    if (!form.addressLine1.trim()) return "Address Line 1 is required";
    if (!form.city.trim()) return "City is required";
    if (!form.state.trim()) return "State is required";
    if (!/^\d{6}$/.test(form.pincode)) return "Pincode must be 6 digits";
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    onSubmit(form);
    onOpenChange(false);
    toast.success(initial ? "Warehouse updated" : "Warehouse added");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2">
            <Label>Warehouse Name *</Label>
            <Input
              value={form.warehouseName}
              onChange={(e) => set("warehouseName", restrictCourierWarehouseNameInput(e.target.value))}
              placeholder="Letters and numbers only"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              No special characters (&amp;, -, @, etc.) — required for courier booking.
            </p>
          </div>
          <div>
            <Label>Contact Person Name *</Label>
            <Input
              value={form.contactPerson}
              onChange={(e) => set("contactPerson", restrictCourierPersonNameInput(e.target.value))}
              placeholder="Letters and spaces only"
            />
          </div>
          <div>
            <Label>Phone Number *</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                +91
              </span>
              <Input
                className="rounded-l-none"
                value={form.phoneNumber}
                maxLength={10}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                onChange={(e) => set("phoneNumber", e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Address Line 1 *</Label>
            <Input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Address Line 2</Label>
            <Input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
          </div>
          <div>
            <Label>Landmark</Label>
            <Input value={form.landmark} onChange={(e) => set("landmark", e.target.value)} />
          </div>
          <div>
            <Label>City *</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label>State *</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div>
            <Label>Pincode *</Label>
            <Input value={form.pincode} maxLength={6} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div>
            <Label>Warehouse Type</Label>
            <Select value={form.warehouseType} onValueChange={(v) => set("warehouseType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="B2B Warehouse">B2B Warehouse</SelectItem>
                <SelectItem value="B2C Warehouse">B2C Warehouse</SelectItem>
                <SelectItem value="Fulfillment Center">Fulfillment Center</SelectItem>
                <SelectItem value="Returns Warehouse">Returns Warehouse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>GST Number</Label>
            <Input value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase())} />
          </div>
          <div className="flex items-center justify-between md:col-span-2 rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">Default Warehouse</Label>
              <p className="text-xs text-muted-foreground">Use as primary pickup location</p>
            </div>
            <Switch checked={form.isDefault} onCheckedChange={(v) => set("isDefault", v)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Update" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
