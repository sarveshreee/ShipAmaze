import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MapPin, Phone, Calendar, Search, X } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

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
  lat?: number;
  lng?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (address: AddressData) => void;
}

function DraggableMarker({ position, onDrag }: { position: [number, number]; onDrag: (lat: number, lng: number) => void }) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const { lat, lng } = marker.getLatLng();
        onDrag(lat, lng);
      }
    },
  };
  return <Marker draggable position={position} ref={markerRef} eventHandlers={eventHandlers} />;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 15); }, [center, map]);
  return null;
}

type LocationMode = "manual" | "gps";

export function AddAddressModal({ open, onClose, onSave }: Props) {
  const [tag, setTag] = useState("Home");
  const [locationMode, setLocationMode] = useState<LocationMode>("manual");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6139, 77.209]);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [selectedPlaceDetail, setSelectedPlaceDetail] = useState("");

  const [address, setAddress] = useState({ addressLine1: "", landmark: "", pincode: "", city: "", state: "", country: "India" });
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const searchTimeout = useRef<NodeJS.Timeout>();

  const resetState = () => {
    setTag("Home");
    setLocationMode("manual");
    setSearchQuery("");
    setSuggestions([]);
    setShowMap(false);
    setShowAddressForm(false);
    setMapCenter([28.6139, 77.209]);
    setSelectedPlace("");
    setSelectedPlaceDetail("");
    setAddress({ addressLine1: "", landmark: "", pincode: "", city: "", state: "", country: "India" });
    setContactName("");
    setContactPhone("");
    setErrors({});
  };

  useEffect(() => { if (!open) resetState(); }, [open]);

  const searchLocations = useCallback(async (q: string) => {
    if (q.length < 5) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=6`);
      const data = await res.json();
      setSuggestions(data);
    } catch { setSuggestions([]); }
    setSearching(false);
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchLocations(val), 400);
  };

  const selectSuggestion = (s: any) => {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setMapCenter([lat, lng]);
    setSelectedPlace(s.display_name?.split(",")[0] || "Selected Location");
    setSelectedPlaceDetail(s.display_name || "");
    setSuggestions([]);
    setShowMap(true);
  };

  const handleUseGPS = () => {
    setLocationMode("gps");
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCenter([latitude, longitude]);
        setSelectedPlace("Your Current Location");
        setSelectedPlaceDetail(`Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`);
        setShowMap(true);
      },
      () => toast.error("Location permission denied. Please enable location access."),
      { enableHighAccuracy: true }
    );
  };

  const confirmLocation = async () => {
    // Reverse geocode to fill address
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${mapCenter[0]}&lon=${mapCenter[1]}`);
      const data = await res.json();
      const addr = data.address || {};
      setAddress({
        addressLine1: [addr.road, addr.neighbourhood, addr.suburb].filter(Boolean).join(", "),
        landmark: addr.amenity || "",
        pincode: addr.postcode || "",
        city: addr.city || addr.town || addr.village || addr.county || "",
        state: addr.state || "",
        country: addr.country || "India",
      });
      setSelectedPlace(data.display_name?.split(",")[0] || selectedPlace);
    } catch {}
    setShowMap(false);
    setShowAddressForm(true);
  };

  const handleMarkerDrag = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!address.addressLine1.trim()) e.addressLine1 = "Required";
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
      lat: mapCenter[0],
      lng: mapCenter[1],
    });
    onClose();
    toast.success("Address saved successfully");
  };

  const tags = ["Home", "Work", "Warehouse", "Other"];

  return (
    <>
      {/* Main Modal */}
      <Dialog open={open && !showMap} onOpenChange={v => { if (!v) onClose(); }}>
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
                  <>
                    <div>
                      <p className="text-sm font-medium mb-2">Are you at this address right now?</p>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="loc-mode" checked={locationMode === "gps"} onChange={() => handleUseGPS()} className="accent-primary" />
                          Yes, Use my present location for address
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="loc-mode" checked={locationMode === "manual"} onChange={() => setLocationMode("manual")} className="accent-primary" />
                          No, I will add the location manually
                        </label>
                      </div>
                    </div>

                    {locationMode === "manual" && (
                      <div className="rounded-lg border border-border p-4 bg-muted/20">
                        <p className="text-sm font-medium mb-1">Search for your pickup address location/building name/area/landmark</p>
                        <p className="text-xs text-muted-foreground mb-3">Please add minimum 5 characters</p>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input value={searchQuery} onChange={e => handleSearchChange(e.target.value)}
                            placeholder="Search Location" className="pl-10" />
                          {searchQuery && (
                            <button onClick={() => { setSearchQuery(""); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                              <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                        {suggestions.length > 0 && (
                          <div className="mt-1 border border-border rounded-lg bg-card max-h-60 overflow-y-auto">
                            {suggestions.map((s, i) => (
                              <button key={i} onClick={() => selectSuggestion(s)}
                                className="flex items-start gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-muted/50 border-b border-border last:border-0">
                                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{s.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searching && <p className="text-xs text-muted-foreground mt-2">Searching...</p>}
                      </div>
                    )}
                  </>
                )}

                {/* Address Form (after map confirmation) */}
                {showAddressForm && (
                  <div className="space-y-4">
                    <button onClick={() => { setShowAddressForm(false); setShowMap(false); }} className="flex items-center gap-1 text-sm text-primary font-medium">
                      ← Change Location
                    </button>
                    <div className="flex gap-6">
                      <div className="flex-1 space-y-4">
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
                      {/* Mini map preview */}
                      <div className="hidden lg:block w-72 h-64 rounded-lg overflow-hidden border border-border shrink-0">
                        <MapContainer center={mapCenter} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <DraggableMarker position={mapCenter} onDrag={handleMarkerDrag} />
                          <MapUpdater center={mapCenter} />
                        </MapContainer>
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
              <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Verify and Save Address
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Location Map Modal */}
      <Dialog open={showMap} onOpenChange={v => { if (!v) setShowMap(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Location</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg overflow-hidden border border-border" style={{ height: 300 }}>
            <MapContainer center={mapCenter} zoom={15} style={{ height: "100%", width: "100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <DraggableMarker position={mapCenter} onDrag={handleMarkerDrag} />
              <MapUpdater center={mapCenter} />
            </MapContainer>
          </div>
          <div className="mt-2">
            <p className="font-medium text-foreground">{selectedPlace}</p>
            <p className="text-sm text-muted-foreground">{selectedPlaceDetail}</p>
          </div>
          <Button onClick={confirmLocation} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2">
            Confirm location
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
