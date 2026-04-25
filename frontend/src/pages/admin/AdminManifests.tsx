import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useManifests, usePickupAddresses, useCouriers } from "@/hooks/useApiData";
import { FileText, Download, Printer, Truck, Clock, CheckCircle2, XCircle, Calendar, MapPin, Plus } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const manifestStatusColors: Record<string, string> = {
  Generated: 'bg-primary-light text-primary-dark',
  Scheduled: 'bg-secondary-light text-secondary-dark',
  'Picked Up': 'bg-success-light text-success-dark',
  Cancelled: 'bg-surface-2 text-text-muted',
};

export default function AdminManifests() {
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const { data: manifests = [], isLoading } = useManifests();
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const { data: courierList = [] } = useCouriers();

  const courierGroups = manifests.reduce((acc, m) => {
    if (!acc[m.courier]) acc[m.courier] = [];
    acc[m.courier].push(m);
    return acc;
  }, {} as Record<string, typeof manifests>);

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading manifests...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Manifests & Pickups" breadcrumb={["Admin", "Manifests"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={FileText} label="Total Manifests" value={String(manifests.length)} color="primary" />
        <KPICard icon={Clock} label="Scheduled" value={String(manifests.filter(m => m.status === 'Scheduled').length)} color="warning" />
        <KPICard icon={CheckCircle2} label="Picked Up" value={String(manifests.filter(m => m.status === 'Picked Up').length)} color="success" />
        <KPICard icon={Truck} label="Pickup Addresses" value={String(pickupAddresses.length)} color="secondary" />
      </div>

      {/* Pickup Scheduling Form */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Schedule Pickup
          </h3>
          <Button size="sm" variant="outline" onClick={() => setShowScheduleForm(!showScheduleForm)}>
            {showScheduleForm ? "Hide Form" : "Schedule New Pickup"}
          </Button>
        </div>
        {showScheduleForm && (
          <div className="rounded-lg bg-card shadow-card p-5 border border-border animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Pickup Address</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-text-primary">
                  {pickupAddresses.map(a => (<option key={a.id} value={a.id}>{a.label} — {a.city}</option>))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Courier</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-text-primary">
                  {courierList.filter(c => c.active).map(c => (<option key={c.name} value={c.name}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Pickup Date</Label>
                <Input type="date" className="mt-1" defaultValue="2026-04-12" />
              </div>
              <div>
                <Label className="text-xs">Time Slot</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-text-primary">
                  <option>9:00 AM – 12:00 PM</option>
                  <option>12:00 PM – 3:00 PM</option>
                  <option>3:00 PM – 6:00 PM</option>
                  <option>6:00 PM – 9:00 PM</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => { toast.success("Pickup scheduled successfully"); setShowScheduleForm(false); }}>Schedule Pickup</Button>
              <Button variant="outline" onClick={() => setShowScheduleForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Pickup Addresses */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Pickup Addresses</h3>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1"><Plus className="h-3.5 w-3.5" /> Add Address</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pickupAddresses.map(a => (
            <div key={a.id} className={cn("rounded-lg bg-card shadow-card p-4 border-2 transition-colors", a.isDefault ? "border-primary" : "border-transparent")}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">{a.label}</span>
                {a.isDefault && <span className="text-xs bg-primary-light text-primary-dark rounded-full px-2 py-0.5">Default</span>}
              </div>
              <p className="text-sm text-text-secondary">{a.contactName} · {a.phone}</p>
              <p className="text-sm text-text-muted mt-1">{a.addressLine1}, {a.addressLine2}</p>
              <p className="text-sm text-text-muted">{a.city}, {a.state} - {a.pincode}</p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => toast.info("Edit address")}>Edit</Button>
                {!a.isDefault && <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toast.success("Set as default")}>Set Default</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Courier-wise Manifest Grouping */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Manifests by Courier</h3>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark gap-1" onClick={() => toast.success("New manifest generated")}>
            <FileText className="h-3.5 w-3.5" /> Generate Manifest
          </Button>
        </div>

        {Object.entries(courierGroups).map(([courier, group]) => (
          <div key={courier} className="rounded-lg bg-card shadow-card overflow-hidden">
            <div className="p-4 border-b border-border bg-surface-2/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light"><Truck className="h-4 w-4 text-primary" /></div>
                <div>
                  <h4 className="font-semibold text-text-primary">{courier}</h4>
                  <p className="text-xs text-text-muted">{group.length} manifests · {group.reduce((s, m) => s + m.ordersCount, 0)} orders</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => toast.success(`All ${courier} manifests downloaded`)}><Download className="h-3.5 w-3.5" /> Download All</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  <th className="p-3 text-left font-medium text-text-secondary">Manifest ID</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Orders</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Weight</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Pickup</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Time</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
                </tr></thead>
                <tbody>
                  {group.map(m => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                      <td className="p-3 font-mono text-xs text-primary">{m.id}</td>
                      <td className="p-3 text-text-muted">{m.date}</td>
                      <td className="p-3 font-medium text-text-primary">{m.ordersCount}</td>
                      <td className="p-3 text-text-secondary">{m.totalWeight}</td>
                      <td className="p-3 text-text-secondary">{m.pickupAddress}</td>
                      <td className="p-3 text-text-muted text-xs">{m.pickupTime || '—'}</td>
                      <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", manifestStatusColors[m.status])}>{m.status}</span></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast.success(`Manifest ${m.id} downloaded`)}><Download className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast.info(`Printing manifest ${m.id}`)}><Printer className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
