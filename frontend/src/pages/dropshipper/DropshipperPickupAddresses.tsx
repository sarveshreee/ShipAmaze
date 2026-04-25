import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { usePickupAddresses } from "@/hooks/useApiData";
import { indianStates } from "@/constants/indianStates";
import { MapPin, Plus, Edit, Trash2, Star, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function DropshipperPickupAddresses() {
  const [showForm, setShowForm] = useState(false);
  const { data: pickupAddresses = [], isLoading } = usePickupAddresses();

  if (isLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading…</div>;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Pickup Addresses" breadcrumb={["Dropshipper", "Addresses"]} />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">{pickupAddresses.length} addresses saved</p>
        <Button onClick={() => setShowForm(!showForm)} className="bg-primary text-primary-foreground hover:bg-primary-dark" type="button">
          <Plus className="h-4 w-4 mr-2" />
          Add New Address
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg bg-card shadow-card p-6 mb-6 border-2 border-primary/20 animate-fade-in-up">
          <h3 className="font-semibold text-text-primary mb-4">New Pickup Address</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Address Label</Label>
              <Input placeholder="e.g. Main Warehouse" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input placeholder="Full name" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input placeholder="+91 98000 00000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input placeholder="email@example.com" />
            </div>
            <div className="sm:col-span-2">
              <Label>Address Line 1</Label>
              <Input placeholder="Building, Street" />
            </div>
            <div className="sm:col-span-2">
              <Label>Address Line 2</Label>
              <Input placeholder="Landmark, Area" />
            </div>
            <div>
              <Label>City</Label>
              <Input placeholder="City" />
            </div>
            <div>
              <Label>State</Label>
              <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mt-1">
                <option value="">Select State</option>
                {indianStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Pincode</Label>
              <Input placeholder="400001" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" type="button">
              Save Address
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} type="button">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pickupAddresses.map((a) => (
          <div
            key={a.id}
            className={cn(
              "rounded-xl bg-card shadow-card p-5 border-2 transition-all hover:shadow-card-md",
              a.isDefault ? "border-primary" : "border-transparent"
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
                  <MapPin className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <span className="font-semibold text-text-primary">{a.label}</span>
                  {a.isDefault && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium">
                      <Star className="h-2.5 w-2.5" />
                      Default
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-text-secondary">
                <User className="h-3.5 w-3.5 text-text-muted" />
                {a.contactName}
              </p>
              <p className="flex items-center gap-2 text-text-secondary">
                <Phone className="h-3.5 w-3.5 text-text-muted" />
                {a.phone}
              </p>
              <p className="text-text-muted mt-2">{a.addressLine1}</p>
              <p className="text-text-muted">{a.addressLine2}</p>
              <p className="text-text-muted">
                {a.city}, {a.state} - {a.pincode}
              </p>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-border">
              <Button size="sm" variant="outline" className="text-xs h-7 flex-1" type="button">
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              {!a.isDefault && (
                <>
                  <Button size="sm" variant="ghost" className="text-xs h-7" type="button">
                    <Star className="h-3 w-3 mr-1" />
                    Set Default
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 text-danger hover:text-danger hover:bg-danger-light"
                    type="button"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
