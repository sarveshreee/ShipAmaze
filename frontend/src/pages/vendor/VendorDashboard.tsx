import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrdersQuery } from "@/hooks/useApiData";
import { Package, Clock, Truck, CheckCircle2, ScanLine, Printer, FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order } from "@/types/logistics";

const today = () => new Date().toISOString().slice(0, 10);

export default function VendorDashboard() {
  const { data: orders = [], tabCounts, isLoading } = useOrdersQuery({
    page: 1,
    pageSize: 15,
    counts: true,
  });

  const toProcess = useMemo(
    () => tabCounts
      ? (tabCounts.manual ?? 0) + (tabCounts.channel ?? 0) + (tabCounts["ready-to-ship"] ?? 0)
      : orders.filter((o) => o.status === "pending" || o.status === "ready-to-ship" || o.status === "on-process").length,
    [orders, tabCounts]
  );
  const pickupsPending = tabCounts?.["pending-pickup"] ?? orders.filter((o) => String(o.status) === "pending-pickup").length;
  const inTransit = useMemo(
    () => tabCounts
      ? (tabCounts["in-transit"] ?? 0) + (tabCounts["out-for-delivery"] ?? 0)
      : orders.filter((o) => o.status === "in-transit" || o.status === "out-for-delivery").length,
    [orders, tabCounts]
  );
  const deliveredToday = useMemo(
    () => orders.filter((o) => o.status === "delivered" && o.date && o.date.startsWith(today())).length,
    [orders]
  );
  const vendorOrders: Order[] = useMemo(() => orders.slice(0, 15), [orders]);

  if (isLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading…</div>;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Vendor", "Dashboard"]} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Package} label="Orders to Process" value={String(toProcess)} color="primary" />
        <KPICard icon={Clock} label="Pickups Pending" value={String(pickupsPending)} color="warning" />
        <KPICard icon={Truck} label="In Transit" value={String(inTransit)} color="secondary" />
        <KPICard icon={CheckCircle2} label="Delivered Today" value={String(deliveredToday)} color="success" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: ScanLine, label: "Scan & Process" },
          { icon: Printer, label: "Print Labels" },
          { icon: FileDown, label: "Download Manifest" },
          { icon: FileText, label: "GST Invoice" },
        ].map((a) => (
          <Button key={a.label} variant="outline" className="h-20 flex-col gap-2">
            <a.icon className="h-5 w-5 text-primary" />
            {a.label}
          </Button>
        ))}
      </div>
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Today&apos;s Orders</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">Weight</th>
              <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
              <th className="p-3 text-left font-medium text-text-secondary">AWB</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendorOrders.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                <td className="p-3 text-text-primary">{o.customer}</td>
                <td className="p-3 text-text-secondary">{o.weight}</td>
                <td className="p-3 text-text-secondary">{o.courier}</td>
                <td className="p-3 font-mono text-xs text-text-muted">{o.awb}</td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    Mark Picked
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7">
                    <Printer className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
