import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useManifests, usePickupAddresses, useCouriers } from "@/hooks/useApiData";
import { FileText, Download, Truck, Clock, CheckCircle2, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const manifestStatusColors: Record<string, string> = {
  Generated: "bg-primary-light text-primary-dark",
  Scheduled: "bg-secondary-light text-secondary-dark",
  "Picked Up": "bg-success-light text-success-dark",
  Cancelled: "bg-surface-2 text-text-muted",
};

export default function AdminManifests() {
  const [showScheduleInfo, setShowScheduleInfo] = useState(false);
  const { data: manifests = [], isLoading, error, refetch } = useManifests();
  const { data: pickupAddresses = [] } = usePickupAddresses();
  const { data: courierList = [] } = useCouriers();

  const courierGroups = manifests.reduce(
    (acc, m) => {
      if (!acc[m.courier]) acc[m.courier] = [];
      acc[m.courier].push(m);
      return acc;
    },
    {} as Record<string, typeof manifests>
  );

  if (isLoading) {
    return (
      <div className="animate-pulse p-8 text-text-muted flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading manifests…
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Manifests & Pickups" breadcrumb={["Admin", "Manifests"]} />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load manifests</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error.message}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={FileText} label="Total Manifests" value={String(manifests.length)} color="primary" />
        <KPICard
          icon={Clock}
          label="Scheduled"
          value={String(manifests.filter((m) => m.status === "Scheduled").length)}
          color="warning"
        />
        <KPICard
          icon={CheckCircle2}
          label="Picked Up"
          value={String(manifests.filter((m) => m.status === "Picked Up").length)}
          color="success"
        />
        <KPICard icon={Truck} label="Pickup Addresses" value={String(pickupAddresses.length)} color="secondary" />
      </div>

      <Alert className="mb-6 border-border bg-surface-2/40">
        <AlertTitle className="text-sm">Manifests & courier pickup</AlertTitle>
        <AlertDescription className="text-xs text-text-muted mt-1">
          ShipAmaze stores manifest summaries you record in operations. AWB-level labels and manifest URLs from Velocity
          appear on each order after shipment creation. Courier pickup scheduling is done in your courier or Velocity
          dashboard unless a future API is connected.
        </AlertDescription>
      </Alert>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Pickup scheduling
          </h3>
          <Button size="sm" variant="outline" type="button" onClick={() => setShowScheduleInfo(!showScheduleInfo)}>
            {showScheduleInfo ? "Hide" : "How it works"}
          </Button>
        </div>
        {showScheduleInfo && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-text-secondary">
            <p>
              Active couriers in the system:{" "}
              <span className="font-medium text-text-primary">
                {courierList.filter((c) => c.active).length || "—"}
              </span>
              . Schedule pickups with your logistics provider; this page lists stored manifest rows only.
            </p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" /> Pickup addresses (read-only here)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pickupAddresses.length === 0 ? (
            <p className="text-sm text-text-muted col-span-full">No pickup addresses loaded.</p>
          ) : (
            pickupAddresses.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-lg bg-card shadow-card p-4 border-2 transition-colors",
                  a.isDefault ? "border-primary" : "border-transparent"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-text-primary">{a.label}</span>
                  {a.isDefault && (
                    <span className="text-xs bg-primary-light text-primary-dark rounded-full px-2 py-0.5">Default</span>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {a.contactName} · {a.phone}
                </p>
                <p className="text-sm text-text-muted mt-1">
                  {a.addressLine1}, {a.addressLine2}
                </p>
                <p className="text-sm text-text-muted">
                  {a.city}, {a.state} - {a.pincode}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Manifests by courier</h3>
        </div>

        {Object.keys(courierGroups).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-2/30 p-10 text-center text-text-muted text-sm">
            No manifest records yet. When operations add manifests to the database, they will appear here grouped by
            courier.
          </div>
        ) : (
          Object.entries(courierGroups).map(([courier, group]) => (
            <div key={courier} className="rounded-lg bg-card shadow-card overflow-hidden">
              <div className="p-4 border-b border-border bg-surface-2/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary">{courier}</h4>
                    <p className="text-xs text-text-muted">
                      {group.length} manifests · {group.reduce((s, m) => s + m.ordersCount, 0)} orders
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left font-medium text-text-secondary">Manifest ID</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Orders</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Weight</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Pickup</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Time</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                      <th className="p-3 text-left font-medium text-text-secondary">Export</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                        <td className="p-3 font-mono text-xs text-primary">{m.id}</td>
                        <td className="p-3 text-text-muted">{m.date}</td>
                        <td className="p-3 font-medium text-text-primary">{m.ordersCount}</td>
                        <td className="p-3 text-text-secondary">{m.totalWeight}</td>
                        <td className="p-3 text-text-secondary">{m.pickupAddress}</td>
                        <td className="p-3 text-text-muted text-xs">{m.pickupTime || "—"}</td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium",
                              manifestStatusColors[m.status] ?? "bg-surface-2 text-text-muted"
                            )}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-xs text-text-muted" title="No file URL stored on this manifest row">
                            <Download className="h-3.5 w-3.5 inline mr-1 opacity-50" />
                            N/A
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
