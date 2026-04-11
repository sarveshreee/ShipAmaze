import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { manifests, pickupAddresses } from "@/data/mockData";
import { FileText, Download, Printer, Truck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const manifestStatusColors: Record<string, string> = {
  Generated: 'bg-primary-light text-primary-dark',
  Scheduled: 'bg-secondary-light text-secondary-dark',
  'Picked Up': 'bg-success-light text-success-dark',
  Cancelled: 'bg-surface-2 text-text-muted',
};

export default function AdminManifests() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Manifests & Pickups" breadcrumb={["Admin", "Manifests"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={FileText} label="Total Manifests" value={String(manifests.length)} color="primary" />
        <KPICard icon={Clock} label="Scheduled" value={String(manifests.filter(m => m.status === 'Scheduled').length)} color="warning" />
        <KPICard icon={CheckCircle2} label="Picked Up" value={String(manifests.filter(m => m.status === 'Picked Up').length)} color="success" />
        <KPICard icon={Truck} label="Pickup Addresses" value={String(pickupAddresses.length)} color="secondary" />
      </div>

      {/* Pickup Addresses */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Pickup Addresses</h3>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark">+ Add Address</Button>
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
                <Button size="sm" variant="outline" className="text-xs h-7">Edit</Button>
                {!a.isDefault && <Button size="sm" variant="ghost" className="text-xs h-7">Set Default</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manifests Table */}
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Recent Manifests</h3>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark">
            <FileText className="h-4 w-4 mr-1" />Generate Manifest
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Manifest ID</th>
            <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
            <th className="p-3 text-left font-medium text-text-secondary">Orders</th>
            <th className="p-3 text-left font-medium text-text-secondary">Weight</th>
            <th className="p-3 text-left font-medium text-text-secondary">Pickup Address</th>
            <th className="p-3 text-left font-medium text-text-secondary">Pickup Time</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {manifests.map(m => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{m.id}</td>
                <td className="p-3 text-text-muted">{m.date}</td>
                <td className="p-3 text-text-secondary">{m.courier}</td>
                <td className="p-3 font-medium text-text-primary">{m.ordersCount}</td>
                <td className="p-3 text-text-secondary">{m.totalWeight}</td>
                <td className="p-3 text-text-secondary">{m.pickupAddress}</td>
                <td className="p-3 text-text-muted text-xs">{m.pickupTime || '—'}</td>
                <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", manifestStatusColors[m.status])}>{m.status}</span></td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Printer className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
