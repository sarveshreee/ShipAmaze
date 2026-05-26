import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Building2, Loader2, Plus } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { toast } from "sonner";
import * as vendorService from "@/services/vendorService";
import type { Vendor } from "@/types/logistics";

const emptyForm = {
  name: "",
  city: "",
  pin: "",
  contactPerson: "",
  phone: "",
  email: "",
};

export default function DropshipperVendors() {
  const [items, setItems] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const current = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await vendorService.listVendors();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load vendors");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!current) {
      setForm(emptyForm);
      return;
    }
    setForm({
      name: current.name ?? "",
      city: current.city ?? "",
      pin: current.pin ?? "",
      contactPerson: current.contactPerson ?? "",
      phone: current.phone ?? "",
      email: current.email ?? "",
    });
  }, [current]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await vendorService.updateVendor(editingId, form);
        toast.success("Vendor updated");
      } else {
        await vendorService.createVendor({ name: form.name.trim(), ...form });
        toast.success("Vendor created");
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Vendors" breadcrumb={["Dropshipper", "Vendors"]} />

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {editingId ? "Edit vendor" : "Add vendor"}
            </p>
            <p className="text-xs text-text-muted">
              Dropshippers only see vendors created by themselves or assigned to them.
            </p>
          </div>
          {editingId ? (
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Vendor name *</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>City</Label>
            <Input className="mt-1" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <Label>Pincode</Label>
            <Input className="mt-1" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} />
          </div>
          <div>
            <Label>Contact person</Label>
            <Input className="mt-1" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="mt-1" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </div>

        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          {editingId ? "Save vendor" : "Create vendor"}
        </Button>
      </Card>

      <Alert>
        <AlertTitle>Warehouse mapping</AlertTitle>
        <AlertDescription>
          SKU-based reassignment uses the selected catalogue SKU to remap orders to this vendor and its default warehouse.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="animate-pulse p-8 text-text-muted">Loading vendors…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No vendors available"
          description="Create your first vendor profile to unlock warehouse linking."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((vendor) => (
            <Card key={vendor.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{vendor.name}</p>
                  <p className="text-xs text-text-muted">
                    {[vendor.city, vendor.pin].filter(Boolean).join(" · ") || "No location yet"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingId(vendor.id)}>
                  Edit
                </Button>
              </div>
              <div className="text-sm text-text-secondary space-y-1">
                {vendor.contactPerson ? <p>Contact: {vendor.contactPerson}</p> : null}
                {vendor.phone ? <p>Phone: {vendor.phone}</p> : null}
                {vendor.email ? <p>Email: {vendor.email}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
