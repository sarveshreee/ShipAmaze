import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MapPin, Phone, Calendar, Search, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface AddressData {
  tag: string;
  label: string;
  contactName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (address: AddressData) => void;
}

export function AddAddressModal({ open, onClose, onSave }: Props) {
  const [tag, setTag] = useState("Home");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showSearchButtons, setShowSearchButtons] = useState(false);

  const [address, setAddress] = useState({ addressLine1: "", landmark: "", pincode: "", city: "", state: "", country: "India" });
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetState = () => {
    setTag("Home");
    setSearchQuery("");
    setShowAddressForm(false);
    setShowSearchButtons(false);
    setAddress({ addressLine1: "", landmark: "", pincode: "", city: "", state: "", country: "India" });
    setContactName("");
    setContactPhone("");
    setErrors({});
  };

  useEffect(() => { if (!open) resetState(); }, [open]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setShowSearchButtons(val.length > 0);
  };

  const handleSearchCancel = () => {
    setSearchQuery("");
    setShowSearchButtons(false);
  };

  const handleSearchOk = () => {
    setShowAddressForm(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!address.addressLine1.trim()) e.addressLine1 = "The address field is required.";
    if (!address.pincode.trim()) e.pincode = "Required";
    if (!address.city.trim()) e.city = "Required";
    if (!address.state.trim()) e.state = "Required";
    if (!contactName.trim()) e.contactName = "Required";
    if (!contactPhone.trim()) e.contactPhone = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      tag,
      label: `${tag} - ${address.city}`,
      contactName,
      phone: contactPhone,
      addressLine1: address.addressLine1,
      addressLine2: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
    });
    onClose();
    toast.success("Address saved successfully");
  };

  const tags = ["Home", "Work", "Warehouse", "Other"];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add New Pickup Address</DialogTitle>
        </DialogHeader>

        {/* 3-step progress indicator */}
        <div className="flex items-center justify-center gap-2 py-4 px-4 bg-muted/30 rounded-lg mb-4">
          <div className="flex flex-col items-center text-center max-w-[180px]">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Provide your full address and exact location for accurate pickups</p>
          </div>
          <div className="flex-shrink-0 border-t-2 border-dashed border-muted-foreground/30 w-12" />
          <div className="flex flex-col items-center text-center max-w-[180px]">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Share the contact details of the person handling shipment handover</p>
          </div>
          <div className="flex-shrink-0 border-t-2 border-dashed border-muted-foreground/30 w-12" />
          <div className="flex flex-col items-center text-center max-w-[180px]">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Specify your operational hours to ensure pickups are scheduled on time</p>
          </div>
        </div>

        {/* Address Details */}
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-foreground mb-3">Address Details</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Tag this address as</p>
                <div className="flex gap-2">
                  {tags.map(t => (
                    <button key={t} onClick={() => setTag(t)}
                      className={cn("px-4 py-1.5 rounded-full text-sm border transition-colors",
                        tag === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                      )}>{t}</button>
                  ))}
                </div>
              </div>

              {!showAddressForm && (
                <div className="rounded-lg border border-border p-4 bg-muted/20">
                  <p className="text-sm font-medium mb-1">Search for your pickup address location/building name/area/landmark</p>
                  <p className="text-xs text-muted-foreground mb-3">Please add minimum 5 characters</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={searchQuery} onChange={e => handleSearchChange(e.target.value)}
                      placeholder="Search Location" className="pl-10" />
                    {searchQuery && (
                      <button onClick={() => { setSearchQuery(""); setShowSearchButtons(false); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {showSearchButtons && (
                    <div className="flex justify-end gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={handleSearchCancel}>Cancel</Button>
                      <Button size="sm" onClick={handleSearchOk}>OK</Button>
                    </div>
                  )}
                </div>
              )}

              {/* Address Form (after search OK) */}
              {showAddressForm && (
                <div className="space-y-4">
                  <button onClick={() => setShowAddressForm(false)} className="flex items-center gap-1 text-sm text-foreground font-semibold">
                    <ArrowLeft className="h-4 w-4" /> Please Type Your Address
                  </button>
                  <div>
                    <Label>Complete address<span className="text-destructive">*</span></Label>
                    <Input value={address.addressLine1} onChange={e => setAddress(p => ({ ...p, addressLine1: e.target.value }))}
                      placeholder="House/Floor No., Building Name or Street, Locality" className={errors.addressLine1 ? "border-destructive" : ""} />
                    {errors.addressLine1 && <p className="text-xs text-destructive mt-1">{errors.addressLine1}</p>}
                  </div>
                  <div>
                    <Label>Landmark</Label>
                    <Input value={address.landmark} onChange={e => setAddress(p => ({ ...p, landmark: e.target.value }))}
                      placeholder="Any nearby post office, market, Hospital as the landmark" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Pincode<span className="text-destructive">*</span></Label>
                      <Input value={address.pincode} onChange={e => setAddress(p => ({ ...p, pincode: e.target.value }))}
                        placeholder="Add Pincode" className={errors.pincode ? "border-destructive" : ""} />
                    </div>
                    <div>
                      <Label>City<span className="text-destructive">*</span></Label>
                      <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))}
                        placeholder="City" className={errors.city ? "border-destructive" : ""} />
                    </div>
                    <div>
                      <Label>State<span className="text-destructive">*</span></Label>
                      <Input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))}
                        placeholder="State" className={errors.state ? "border-destructive" : ""} />
                    </div>
                  </div>
                  <div className="w-1/3">
                    <Label>Country</Label>
                    <Input value={address.country} onChange={e => setAddress(p => ({ ...p, country: e.target.value }))} />
                  </div>

                  <h3 className="font-semibold text-foreground pt-2">Contact Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contact Name<span className="text-destructive">*</span></Label>
                      <Input value={contactName} onChange={e => setContactName(e.target.value)}
                        placeholder="Person handling pickups" className={errors.contactName ? "border-destructive" : ""} />
                    </div>
                    <div>
                      <Label>Phone<span className="text-destructive">*</span></Label>
                      <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                        placeholder="+91 98000 00000" className={errors.contactPhone ? "border-destructive" : ""} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {showAddressForm && (
            <Button onClick={handleSave}>
              Verify and Save Address
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
