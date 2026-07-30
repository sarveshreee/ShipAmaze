import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { Package, Clock, Truck, CheckCircle2, ScanLine, Printer, FileDown, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useDashboardSummary } from "@/hooks/useApiData";
import { toast } from "sonner";
import { useEffect } from "react";

type DashboardSummary = {
  toProcess: number;
  pickupsPending: number;
  inTransit: number;
  deliveredToday: number;
  recentOrders: Array<{
    id: string;
    customer: string;
    status: string;
    courier: string;
    awb: string;
    weight: string;
    date: string;
  }>;
  today?: string;
};

export default function VendorDashboard() {
  const navigate = useNavigate();
  const { data: summary, loading, error, reload } = useDashboardSummary<DashboardSummary>();

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  if (loading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading…</div>;
  }

  if (error && !summary) {
    return (
      <div className="animate-fade-in-up p-8 text-center space-y-3">
        <p className="text-text-muted">{error}</p>
        <Button variant="outline" className="gap-2" onClick={reload}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const vendorOrders = summary?.recentOrders ?? [];

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Dashboard"
        breadcrumb={["Vendor", "Dashboard"]}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={reload}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Package} label="Orders to Process" value={String(summary?.toProcess ?? 0)} color="primary" />
        <KPICard icon={Clock} label="Pickups Pending" value={String(summary?.pickupsPending ?? 0)} color="warning" />
        <KPICard icon={Truck} label="In Transit" value={String(summary?.inTransit ?? 0)} color="secondary" />
        <KPICard icon={CheckCircle2} label="Delivered Today" value={String(summary?.deliveredToday ?? 0)} color="success" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: ScanLine, label: "Scan & Process", path: "/vendor/orders" },
          { icon: Printer, label: "Print Labels", path: "/vendor/orders" },
          { icon: FileDown, label: "Download Manifest", path: "/vendor/orders" },
          { icon: FileText, label: "GST Invoice", path: "/vendor/orders" },
        ].map((a) => (
          <Button key={a.label} variant="outline" className="h-20 flex-col gap-2" onClick={() => navigate(a.path)}>
            <a.icon className="h-5 w-5 text-primary" />
            {a.label}
          </Button>
        ))}
      </div>
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Recent Orders</h3>
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
                <td className="p-3 text-text-secondary">{o.weight || "—"}</td>
                <td className="p-3 text-text-secondary">{o.courier || "—"}</td>
                <td className="p-3 font-mono text-xs text-text-muted">{o.awb || "—"}</td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/vendor/orders")}>
                    Open
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => navigate("/vendor/orders")}>
                    <Printer className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {!vendorOrders.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-text-muted">No orders yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
