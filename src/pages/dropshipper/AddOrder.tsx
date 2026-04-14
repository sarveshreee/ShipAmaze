import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MapPin, User, Truck, Package, Box, ChevronRight, ChevronLeft, Plus, Phone } from "lucide-react";
import { pickupAddresses } from "@/data/mockData";

const steps = [
  { num: 1, label: "Pickup Address", icon: MapPin },
  { num: 2, label: "Consignee Details", icon: User },
  { num: 3, label: "Shipment Details", icon: Truck },
  { num: 4, label: "Package Details", icon: Package },
  { num: 5, label: "Courier", icon: Box },
];

type TabType = "single" | "bulk";

export default function AddOrder() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("single");
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPickup, setSelectedPickup] = useState(pickupAddresses[0]?.id || "");
  const [showReturn, setShowReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(pickupAddresses[0]?.id || "");

  const selectedPickupAddr = pickupAddresses.find(a => a.id === selectedPickup);
  const selectedReturnAddr = pickupAddresses.find(a => a.id === selectedReturn);

  const canNext = currentStep < 5;
  const canPrev = currentStep > 1;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Add Order" breadcrumb={["Dropshipper", "Add Order"]}
        actions={
          <Button variant="outline" className="border-primary text-primary hover:bg-primary-light gap-2">
            <Plus className="h-4 w-4" />Add Warehouse
          </Button>
        }
      />

      {/* Single / Bulk tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        <button onClick={() => setActiveTab("single")}
          className={cn("px-5 py-2.5 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
            activeTab === "single" ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          )}>Single Order</button>
        <button onClick={() => { setActiveTab("bulk"); navigate("/dropshipper/bulk-upload"); }}
          className={cn("px-5 py-2.5 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
            activeTab === "bulk" ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          )}>Bulk Order</button>
      </div>

      <div className="flex gap-6">
        {/* Left stepper */}
        <div className="hidden md:flex flex-col gap-1 w-52 shrink-0">
          {steps.map((s, i) => {
            const active = currentStep === s.num;
            const done = currentStep > s.num;
            return (
              <button key={s.num} onClick={() => setCurrentStep(s.num)}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm transition-colors",
                  active ? "bg-primary-light text-primary font-medium" : done ? "text-success" : "text-text-secondary hover:text-text-primary"
                )}>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-xs font-bold",
                  active ? "bg-primary text-primary-foreground" : done ? "bg-success text-white" : "bg-surface-2 text-text-muted"
                )}>
                  {done ? "✓" : s.num}
                </div>
                <div>
                  <p className="text-xs text-text-muted">Step {s.num}</p>
                  <p className="font-medium">{s.label}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {currentStep === 1 && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 space-y-5">
                <div>
                  <Label className="text-sm font-medium">Select Pickup Address<span className="text-danger">*</span></Label>
                  <select value={selectedPickup} onChange={e => setSelectedPickup(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                    {pickupAddresses.map(a => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={showReturn} onCheckedChange={setShowReturn} />
                  <Label className="text-sm cursor-pointer" onClick={() => setShowReturn(!showReturn)}>Return Address (if any)</Label>
                </div>

                {showReturn && (
                  <div>
                    <Label className="text-sm font-medium">Select Return Address<span className="text-danger">*</span></Label>
                    <select value={selectedReturn} onChange={e => setSelectedReturn(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                      {pickupAddresses.map(a => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <Button variant="outline" className="gap-2 text-sm">
                  <Plus className="h-4 w-4" /> Add Address
                </Button>
              </div>

              {/* Right preview cards */}
              <div className="w-full lg:w-80 space-y-4">
                {selectedPickupAddr && (
                  <div className="rounded-lg border border-border bg-card p-5 relative">
                    <div className="absolute top-4 right-4">
                      <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-text-primary mb-3">Pickup Address</h4>
                    <p className="text-sm text-text-secondary font-medium">{selectedPickupAddr.label}</p>
                    <p className="text-sm text-primary font-medium mt-1">{selectedPickupAddr.contactName}</p>
                    <p className="text-sm text-text-secondary mt-1">{selectedPickupAddr.addressLine1}</p>
                    <p className="text-sm text-text-secondary">{selectedPickupAddr.addressLine2}</p>
                    <p className="text-sm text-text-secondary">{selectedPickupAddr.city}, {selectedPickupAddr.state}, {selectedPickupAddr.pincode}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-text-secondary">
                      <Phone className="h-3.5 w-3.5" />{selectedPickupAddr.phone}
                    </div>
                  </div>
                )}

                {showReturn && selectedReturnAddr && (
                  <div className="rounded-lg border border-border bg-card p-5 relative">
                    <div className="absolute top-4 right-4">
                      <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-text-primary mb-3">Return Address</h4>
                    <p className="text-sm text-text-secondary font-medium">{selectedReturnAddr.label}</p>
                    <p className="text-sm text-primary font-medium mt-1">{selectedReturnAddr.contactName}</p>
                    <p className="text-sm text-text-secondary mt-1">{selectedReturnAddr.addressLine1}</p>
                    <p className="text-sm text-text-secondary">{selectedReturnAddr.addressLine2}</p>
                    <p className="text-sm text-text-secondary">{selectedReturnAddr.city}, {selectedReturnAddr.state}, {selectedReturnAddr.pincode}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-text-secondary">
                      <Phone className="h-3.5 w-3.5" />{selectedReturnAddr.phone}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Consignee Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Full Name<span className="text-danger">*</span></Label><Input placeholder="Customer name" /></div>
                <div><Label>Phone<span className="text-danger">*</span></Label><Input placeholder="+91 98000 00000" /></div>
                <div><Label>Email</Label><Input placeholder="customer@email.com" /></div>
                <div><Label>Alt Phone</Label><Input placeholder="Alternate number" /></div>
                <div className="sm:col-span-2"><Label>Address Line 1<span className="text-danger">*</span></Label><Input placeholder="Building, Street" /></div>
                <div className="sm:col-span-2"><Label>Address Line 2</Label><Input placeholder="Landmark, Area" /></div>
                <div><Label>City<span className="text-danger">*</span></Label><Input placeholder="City" /></div>
                <div><Label>State<span className="text-danger">*</span></Label><Input placeholder="State" /></div>
                <div><Label>Pincode<span className="text-danger">*</span></Label><Input placeholder="6-digit pincode" /></div>
                <div><Label>Country</Label><Input placeholder="India" defaultValue="India" /></div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Shipment Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Order Reference</Label><Input placeholder="e.g. ORD-12345" /></div>
                <div>
                  <Label>Payment Type<span className="text-danger">*</span></Label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                    <option>Prepaid</option>
                    <option>COD</option>
                  </select>
                </div>
                <div><Label>Invoice Value<span className="text-danger">*</span></Label><Input placeholder="₹0.00" type="number" /></div>
                <div><Label>COD Amount</Label><Input placeholder="₹0.00" type="number" /></div>
              </div>
              <h4 className="font-medium text-text-primary pt-2">Products</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div><Label>Product Name</Label><Input placeholder="Item name" /></div>
                <div><Label>Qty</Label><Input placeholder="1" type="number" /></div>
                <div><Label>Weight (kg)</Label><Input placeholder="0.5" type="number" /></div>
                <div><Label>Price (₹)</Label><Input placeholder="0" type="number" /></div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Product</Button>
            </div>
          )}

          {currentStep === 4 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Package Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Actual Weight<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    <Input placeholder="Enter weight..." type="number" className="flex-1" />
                    <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">KG</span>
                  </div>
                </div>
                <div>
                  <Label>Dimensions<span className="text-danger">*</span></Label>
                  <div className="flex gap-2 mt-1 items-center">
                    <Input placeholder="Length" type="number" />
                    <span className="text-text-muted">×</span>
                    <Input placeholder="Width" type="number" />
                    <span className="text-text-muted">×</span>
                    <Input placeholder="Height" type="number" />
                    <span className="flex items-center text-sm text-text-muted px-2 bg-surface-2 rounded-md border border-border">cm</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Weight Presets</Label>
                <div className="flex flex-wrap gap-3">
                  {["0.5 KG", "1 KG", "2 KG", "5 KG", "Other"].map(w => (
                    <label key={w} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="weight-preset" className="accent-primary" defaultChecked={w === "Other"} />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold text-text-primary">Choose Courier</h3>
              <div>
                <Label className="mb-2 block">Selection Mode<span className="text-danger">*</span></Label>
                <div className="flex gap-4">
                  {["Priority Selection", "Courier Selection"].map(m => (
                    <label key={m} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="courier-mode" className="accent-primary" defaultChecked={m === "Priority Selection"} />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-sm text-text-muted">Priority Selection will automatically assign the best courier based on your priority settings.</p>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-end gap-3 mt-6">
            {canPrev && (
              <Button variant="outline" onClick={() => setCurrentStep(s => s - 1)} className="gap-2">
                <ChevronLeft className="h-4 w-4" />Previous
              </Button>
            )}
            {canNext ? (
              <Button onClick={() => setCurrentStep(s => s + 1)} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
                Next<ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2" onClick={() => navigate("/dropshipper/orders")}>
                Submit Order
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
