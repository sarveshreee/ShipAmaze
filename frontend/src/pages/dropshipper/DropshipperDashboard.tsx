import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrders, useNdrOrders } from "@/hooks/useApiData";
import {
  Package,
  CheckCircle2,
  Truck,
  Clock,
  Wallet,
  Banknote,
  Plus,
  Upload,
  Link2,
  BarChart3,
  AlertTriangle,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate, Link } from "react-router-dom";
const dayName = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - offset));
  return d.toLocaleDateString("en-IN", { weekday: "short" });
};

export default function DropshipperDashboard() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading: ordersLoading } = useOrders();
  const { data: ndrRows = [], isLoading: ndrLoading } = useNdrOrders();
  const activeNDR = useMemo(() => ndrRows.filter((n) => n.status === "Active").length, [ndrRows]);
  const [showNDRBanner, setShowNDRBanner] = useState(activeNDR > 0);

  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const inTransit = orders.filter((o) => o.status === "in-transit" || o.status === "out-for-delivery").length;
    const pending = orders.filter(
      (o) => o.status === "pending" || o.status === "ready-to-ship" || o.status === "not-picked"
    ).length;
    const amountSum = orders.reduce((s, o) => s + (o.amount || 0), 0);
    const codPending = orders.filter((o) => o.payment === "COD" && o.status !== "delivered");
    const codAmt = codPending.reduce((s, o) => s + o.amount, 0);
    return { total, delivered, inTransit, pending, amountSum, codAmt };
  }, [orders]);

  const weeklyOrders = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const o of orders) {
      if (!o.date) continue;
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) continue;
      const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) counts[6 - diff] += 1;
    }
    return counts.map((orders, i) => ({ day: dayName(i), orders }));
  }, [orders]);

  if (ordersLoading || ndrLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading…</div>;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Dropshipper", "Dashboard"]} />

      {showNDRBanner && activeNDR > 0 && (
        <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-6 flex items-center gap-3 animate-fade-in">
          <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-warning-dark">You have {activeNDR} orders with failed delivery. Take action →</p>
            <p className="text-sm text-warning-dark/70">Respond quickly to reduce RTO and improve delivery rates</p>
          </div>
          <Link to="/dropshipper/ndr">
            <Button size="sm" className="bg-warning text-white hover:bg-warning-dark gap-1 shrink-0">
              <ArrowRight className="h-3.5 w-3.5" /> View NDR
            </Button>
          </Link>
          <button
            onClick={() => setShowNDRBanner(false)}
            className="text-warning-dark/60 hover:text-warning-dark shrink-0"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value={String(stats.total)} color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value={String(stats.delivered)} color="success" />
        <KPICard icon={Truck} label="In Transit" value={String(stats.inTransit)} color="secondary" />
        <KPICard icon={Clock} label="Pending" value={String(stats.pending)} color="warning" />
        <KPICard
          icon={Wallet}
          label="Order value (sum)"
          value={stats.total ? `₹${Math.round(stats.amountSum).toLocaleString("en-IN")}` : "0"}
          color="tertiary"
        />
        <KPICard
          icon={Banknote}
          label="COD Pending"
          value={stats.codAmt ? `₹${Math.round(stats.codAmt).toLocaleString("en-IN")}` : "—"}
          color="warning"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { icon: Plus, label: "Create Order", path: "/dropshipper/create-order" },
          { icon: Upload, label: "Bulk Upload", path: "/dropshipper/bulk-upload" },
          { icon: Link2, label: "Connect Store", path: "/dropshipper/channels" },
          { icon: BarChart3, label: "Analytics", path: "/dropshipper/rates" },
        ].map((a) => (
          <Button key={a.label} variant="outline" onClick={() => navigate(a.path)} className="gap-2">
            <a.icon className="h-4 w-4 text-primary" />
            {a.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Orders This Week (by day)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyOrders}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
              <Tooltip />
              <Bar dataKey="orders" fill="hsl(var(--color-primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Performance (approx.)</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Delivery Rate", value: stats.total ? Math.round((stats.delivered / stats.total) * 100) : 0, color: "text-success" },
              { label: "RTO Rate", value: stats.total ? Math.round((orders.filter((o) => o.status === "rto").length / stats.total) * 100) : 0, color: "text-danger" },
              { label: "NDR Rate", value: stats.total ? Math.round((orders.filter((o) => o.status === "ndr").length / stats.total) * 100) : 0, color: "text-warning" },
            ].map((p) => (
              <div key={p.label} className="text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" stroke="hsl(var(--color-border))" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      strokeWidth="6"
                      stroke="currentColor"
                      className={p.color}
                      strokeDasharray={`${p.value * 2.14} 214`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`absolute text-lg font-bold ${p.color}`}>{p.value}%</span>
                </div>
                <p className="text-xs text-text-secondary mt-1">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
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
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 8).map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                <td className="p-3 text-text-primary">{o.customer}</td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="p-3 text-text-muted">{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
