import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { usePickupAddresses } from "@/hooks/useApiData";
import { indianStates } from "@/constants/indianStates";
import { MapPin, Plus, Edit, Trash2, Star, Phone, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PickupAddress } from "@/types/logistics";
import * as pickupService from "@/services/pickupService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const emptyForm = {
  label: "",
  contactName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  isDefault: false,
};

export default function DropshipperPickupAddresses() {
  const { data: pickupAddresses = [], isLoading, refetch } = usePickupAddresses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null);
      setForm(emptyForm);
    }
  }, [dialogOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (a: PickupAddress) => {
    setEditingId(a.id);
    setForm({
      label: a.label,
      contactName: a.contactName,
      phone: a.phone,
      email: a.email ?? "",
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2 ?? "",
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      country: a.country || "India",
      isDefault: a.isDefault,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      toast.error("Fill address name, line 1, city, state, and pincode");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await pickupService.updatePickupAddress(editingId, {
          label: form.label.trim(),
          contactName: form.contactName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          country: form.country.trim() || "India",
          isDefault: form.isDefault,
        });
        toast.success("Address updated");
      } else {
        await pickupService.createPickupAddress({
          label: form.label.trim(),
          contactName: form.contactName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          country: form.country.trim() || "India",
          isDefault: form.isDefault,
        });
        toast.success("Address saved");
      }
      window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses"));
      await refetch();
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const onSetDefault = async (id: string) => {
    try {
      await pickupService.setDefaultPickupAddress(id);
      toast.success("Default address updated");
      window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses"));
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to set default");
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await pickupService.deletePickupAddress(deleteId);
      toast.success("Address removed");
      window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses"));
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete");
    } finally {
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading…</div>;
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader title="Pickup Addresses" breadcrumb={["Dropshipper", "Addresses"]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          {pickupAddresses.length} address{pickupAddresses.length !== 1 ? "es" : ""} saved
        </p>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary-dark shrink-0" type="button">
          <Plus className="h-4 w-4 mr-2" />
          Add new address
        </Button>
      </div>

      {pickupAddresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <MapPin className="h-10 w-10 mx-auto text-text-muted mb-3" />
          <p className="text-text-primary font-medium">No pickup addresses added yet</p>
          <p className="text-sm text-text-muted mt-1 mb-4">Add your first warehouse or pickup location for shipments.</p>
          <Button onClick={openCreate} type="button" className="bg-primary text-primary-foreground hover:bg-primary-dark">
            <Plus className="h-4 w-4 mr-2" />
            Add address
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pickupAddresses.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl bg-card shadow-card border p-5 flex flex-col transition-shadow hover:shadow-card-md",
                a.isDefault ? "border-primary ring-1 ring-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-light">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{a.label}</p>
                    {a.isDefault && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium">
                        <Star className="h-2.5 w-2.5" />
                        Default
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-sm flex-1">
                <p className="flex items-start gap-2 text-text-secondary">
                  <User className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span>{a.contactName || "—"}</span>
                </p>
                <p className="flex items-center gap-2 text-text-secondary">
                  <Phone className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span>{a.phone || "—"}</span>
                </p>
                {a.email ? (
                  <p className="flex items-center gap-2 text-text-secondary">
                    <Mail className="h-3.5 w-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{a.email}</span>
                  </p>
                ) : null}
                <p className="text-text-muted pt-2 leading-relaxed">
                  {[a.addressLine1, a.addressLine2].filter(Boolean).join(", ")}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  {a.country && a.country !== "India" ? `, ${a.country}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                <Button size="sm" variant="outline" className="text-xs h-8" type="button" onClick={() => openEdit(a)}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                {!a.isDefault && (
                  <Button size="sm" variant="outline" className="text-xs h-8" type="button" onClick={() => void onSetDefault(a.id)}>
                    <Star className="h-3 w-3 mr-1" />
                    Set default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 text-danger hover:text-danger hover:bg-danger-light ml-auto"
                  type="button"
                  onClick={() => setDeleteId(a.id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit pickup address" : "New pickup address"}</DialogTitle>
            <DialogDescription>Used as ship-from locations when creating orders.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="sm:col-span-2">
              <Label>Address name</Label>
              <Input className="mt-1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Mumbai warehouse" />
            </div>
            <div>
              <Label>Contact person</Label>
              <Input className="mt-1" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Email (optional)</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address line 1</Label>
              <Input className="mt-1" value={form.addressLine1} onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address line 2</Label>
              <Input className="mt-1" value={form.addressLine2} onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))} />
            </div>
            <div>
              <Label>City</Label>
              <Input className="mt-1" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>State</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              >
                <option value="">Select state</option>
                {indianStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Pincode</Label>
              <Input className="mt-1" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
            </div>
            <div>
              <Label>Country</Label>
              <Input className="mt-1" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <Checkbox id="def" checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: Boolean(v) }))} />
              <Label htmlFor="def" className="text-sm font-normal cursor-pointer">
                Set as default pickup address
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary-dark" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Orders already using this label are unchanged.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
