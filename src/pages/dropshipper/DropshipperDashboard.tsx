import { useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrders, useNdrOrders } from "@/hooks/useSupabaseData";
import { Package, CheckCircle2, Truck, Clock, Wallet, Banknote, Plus, Upload, Link2, BarChart3, AlertTriangle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";

export default function DropshipperDashboard() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useOrders();
  const { data: ndrOrders } = useNdrOrders();
  const activeNDR = ndrOrders.filter(n => n.status === 'Active').length;
  const [showNDRBanner, setShowNDRBanner] = useState(true);

  const stats = useMemo(() => ({
    total: orders.length,
    delivered: orders.filter(o => o.status === "delivered").length,
    inTransit: orders.filter(o => o.status === "in-transit").length,
    pending: orders.filter(o => o.status === "pending").length,
  }), [orders]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Dropshipper", "Dashboard"]} />

      {showNDRBanner && activeNDR > 0 && (
        <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-6 flex items-center gap-3 animate-fade-in">
          <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-warning-dark">
              You have {activeNDR} orders with failed delivery. Take action →
            </p>
            <p className="text-sm text-warning-dark/70">Respond quickly to reduce RTO and improve delivery rates</p>
          </div>
          <Link to="/dropshipper/ndr">
            <Button size="sm" className="bg-warning text-white hover:bg-warning-dark gap-1 shrink-0">
              <ArrowRight className="h-3.5 w-3.5" /> View NDR
            </Button>
          </Link>
          <button onClick={() => setShowNDRBanner(false)} className="text-warning-dark/60 hover:text-warning-dark shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value={String(stats.total)} color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value={String(stats.delivered)} color="success" />
        <KPICard icon={Truck} label="In Transit" value={String(stats.inTransit)} color="secondary" />
        <KPICard icon={Clock} label="Pending" value={String(stats.pending)} color="warning" />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[{ icon: Plus, label: "Create Order", path: "/dropshipper/create-order" }, { icon: Upload, label: "Bulk Upload", path: "/dropshipper/bulk-upload" }, { icon: Link2, label: "Connect Store", path: "/dropshipper/channels" }, { icon: BarChart3, label: "Rate Calculator", path: "/dropshipper/rates" }].map(a => (
          <Button key={a.label} variant="outline" onClick={() => navigate(a.path)} className="gap-2">
            <a.icon className="h-4 w-4 text-primary" />{a.label}
          </Button>
        ))}
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border"><h3 className="font-semibold text-text-primary">Recent Orders</h3></div>
        {isLoading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">No orders yet. Create your first order!</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            </tr></thead>
            <tbody>{orders.slice(0, 8).map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                <td className="p-3 text-text-primary">{o.customer}</td>
                <td className="p-3"><StatusBadge status={o.status}/></td>
                <td className="p-3 text-text-muted">{o.date}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
