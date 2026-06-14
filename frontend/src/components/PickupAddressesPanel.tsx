import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { usePickupAddresses } from "@/hooks/useApiData";
import { indianStates } from "@/constants/indianStates";
import { MapPin, Plus, Edit, Trash2, Star, Phone, User, Mail, AlertTriangle } from "lucide-react";
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
import { VelocityWarehouseLinkCard } from "@/components/VelocityWarehouseLinkCard";
import { VelocityWarehouseLinkStatusBadge } from "@/components/VelocityWarehouseLinkStatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getVelocityWarehouseLinkStatus, normalizeVelocityWarehouseCode } from "@/lib/velocityWarehouseLink";

const emptyForm = {
  label: "",
  contactName: "",
  phone: "",
  alternatePhone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  gstin: "",
  isDefault: false,
  isActive: true,
};

function notifyPickupRefetch() {
  window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses"));
  window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses_platform"));
}

interface Props {
  breadcrumb: [string, string];
  subtitle?: string;
}

export default function PickupAddressesPanel({ breadcrumb, subtitle }: Props) {
  const { data: pickupAddresses = [], isLoading, refetch } = usePickupAddresses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  /** Velocity code on the address being edited — for edit-dialog warnings only. */
  const [editingVelocityWarehouseId, setEditingVelocityWarehouseId] = useState<string | undefined>();

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null);
      setForm(emptyForm);
      setEditingVelocityWarehouseId(undefined);
    }
  }, [dialogOpen]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refetch]);

  const openCreate = () => {
    setEditingId(null);
    setEditingVelocityWarehouseId(undefined);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (a: PickupAddress) => {
    setEditingId(a.id);
    setEditingVelocityWarehouseId(a.velocityWarehouseId);
    setForm({
      label: a.label,
      contactName: a.contactName,
      phone: a.phone,
      alternatePhone: a.alternatePhone ?? "",
      email: a.email ?? "",
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2 ?? "",
      landmark: a.landmark ?? "",
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      country: a.country || "India",
      gstin: a.gstin ?? "",
      isDefault: a.isDefault,
      isActive: a.isActive !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label.trim() || !form.contactName.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      toast.error("Fill warehouse name, contact person, line 1, city, state, and pincode");
      return;
    }
    const pinDigits = form.pincode.replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(pinDigits)) {
      toast.error("Pincode must be exactly 6 digits");
      return;
    }
    const phoneDigits = form.phone.replace(/\D/g, "");
    let primary = phoneDigits;
    if (primary.length === 12 && primary.startsWith("91")) primary = primary.slice(2);
    if (primary.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        alternatePhone: form.alternatePhone.trim() || undefined,
        email: form.email.trim() || undefined,
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        landmark: form.landmark.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: pinDigits,
        country: form.country.trim() || "India",
        gstin: form.gstin.trim() || undefined,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      if (editingId) {
        await pickupService.updatePickupAddress(editingId, payload);
        toast.success("Address updated");
      } else {
        await pickupService.createPickupAddress(payload);
        toast.success("Address saved");
      }
      notifyPickupRefetch();
      await refetch();
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const onSetDefault = async (id: string) => {
    try {
      await pickupService.setDefaultPickupAddress(id);
      toast.success("Default address updated");
      notifyPickupRefetch();
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
      notifyPickupRefetch();
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
      <PageHeader title="Pickup Addresses" breadcrumb={breadcrumb} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          {subtitle ?? `${pickupAddresses.length} address${pickupAddresses.length !== 1 ? "es" : ""} saved`}
        </p>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary-dark shrink-0" type="button">
          <Plus className="h-4 w-4 mr-2" />
          Add pickup address
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
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium">
                          <Star className="h-2.5 w-2.5" />
                          Default
                        </span>
                      )}
                      <VelocityWarehouseLinkStatusBadge velocityWarehouseId={a.velocityWarehouseId} />
                      {a.isActive === false ? (
                        <span className="inline-flex rounded-full bg-text-muted/20 text-text-muted px-2 py-0.5 text-[10px] font-medium">
                          Inactive
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-success-light text-success-dark px-2 py-0.5 text-[10px] font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    {getVelocityWarehouseLinkStatus(a.velocityWarehouseId) === "linked" ? (
                      <p className="mt-1 font-mono text-[11px] font-semibold text-primary">
                        {normalizeVelocityWarehouseCode(a.velocityWarehouseId)}
                      </p>
                    ) : getVelocityWarehouseLinkStatus(a.velocityWarehouseId) === "not_linked" ? (
                      <p className="mt-1 text-[10px] text-warning-dark">Not linked — booking disabled</p>
                    ) : a.velocityWarehouseId?.trim() ? (
                      <p className="mt-1 text-[10px] text-danger">Invalid Velocity code</p>
                    ) : null}
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
                  {[a.addressLine1, a.addressLine2, a.landmark].filter(Boolean).join(", ")}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  {a.country && a.country !== "India" ? `, ${a.country}` : ""}
                </p>
                {a.gstin ? <p className="text-xs text-text-muted pt-1">GSTIN: {a.gstin}</p> : null}
              </div>

              <VelocityWarehouseLinkCard
                mongoId={a.id}
                velocityWarehouseId={a.velocityWarehouseId}
                onUpdated={async () => {
                  notifyPickupRefetch();
                  await refetch();
                }}
                forbiddenHint="pickup"
              />

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
            <DialogDescription>Warehouse / ship-from location used when creating orders.</DialogDescription>
          </DialogHeader>
          {editingId &&
          (getVelocityWarehouseLinkStatus(editingVelocityWarehouseId) === "linked" ||
            getVelocityWarehouseLinkStatus(editingVelocityWarehouseId) === "invalid") ? (
            <Alert className="border-warning/40 bg-warning-light/40 py-2.5 [&>svg]:text-warning-dark">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs text-warning-dark">
                Address changes do not automatically update Velocity. Update the warehouse in Velocity Dashboard if
                required.
                {normalizeVelocityWarehouseCode(editingVelocityWarehouseId) ? (
                  <>
                    {" "}
                    Linked code:{" "}
                    <span className="font-mono font-semibold">
                      {normalizeVelocityWarehouseCode(editingVelocityWarehouseId)}
                    </span>
                  </>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="sm:col-span-2">
              <Label>Warehouse / address name</Label>
              <Input className="mt-1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Mumbai warehouse" />
            </div>
            <div>
              <Label>Contact person</Label>
              <Input className="mt-1" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" />
            </div>
            <div>
              <Label>Alternate mobile (optional)</Label>
              <Input className="mt-1" value={form.alternatePhone} onChange={(e) => setForm((f) => ({ ...f, alternatePhone: e.target.value }))} />
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
            <div className="sm:col-span-2">
              <Label>Landmark (optional)</Label>
              <Input className="mt-1" value={form.landmark} onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))} placeholder="Nearby landmark" />
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
            <div className="sm:col-span-2">
              <Label>GST (optional)</Label>
              <Input className="mt-1" value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} maxLength={15} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <Checkbox id="def" checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: Boolean(v) }))} />
              <Label htmlFor="def" className="text-sm font-normal cursor-pointer">
                Set as default pickup address
              </Label>
            </div>
            {editingId ? (
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <Checkbox id="act" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))} />
                <Label htmlFor="act" className="text-sm font-normal cursor-pointer">
                  Address is active (inactive addresses cannot be used for new orders)
                </Label>
              </div>
            ) : null}
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
            <AlertDialogTitle>Remove this pickup address?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be deactivated and hidden from your list. Existing orders keep their saved pickup details.
            </AlertDialogDescription>
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
