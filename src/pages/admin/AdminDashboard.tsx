import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { Package, CheckCircle2, RotateCcw, AlertTriangle, IndianRupee, Users } from "lucide-react";
import { useOrders } from "@/hooks/useSupabaseData";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { Link } from "react-router-dom";
import { useMemo } from "react";

export default function AdminDashboard() {
  const { data: orders, isLoading } = useOrders();

  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter(o => o.status === "delivered").length;
    const rto = orders.filter(o => o.status === "rto").length;
    const ndr = orders.filter(o => o.status === "ndr").length;
    const revenue = orders.reduce((s, o) => s + o.amount, 0);
    return { total, delivered, rto: total ? ((rto / total) * 100).toFixed(1) : "0", ndr: total ? ((ndr / total) * 100).toFixed(1) : "0", revenue };
  }, [orders]);

  const ordersByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    const colors: Record<string, string> = {
      delivered: "#22c55e", "in-transit": "#6366f1", pending: "#f59e0b", ndr: "#ef4444", rto: "#dc2626",
      "ready-to-ship": "#10b981", "out-for-delivery": "#3b82f6", cancelled: "#94a3b8", draft: "#cbd5e1",
    };
    return Object.entries(map).map(([name, value]) => ({ name: name.replace(/-/g, " "), value, color: colors[name] || "#94a3b8" }));
  }, [orders]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Admin", "Dashboard"]} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value={String(stats.total)} color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value={String(stats.delivered)} color="success" />
        <KPICard icon={RotateCcw} label="RTO %" value={`${stats.rto}%`} color="danger" />
        <KPICard icon={AlertTriangle} label="NDR %" value={`${stats.ndr}%`} color="warning" />
        <KPICard icon={IndianRupee} label="Revenue" value={`₹${(stats.revenue / 100000).toFixed(1)}L`} color="tertiary" />
        <KPICard icon={Users} label="Orders Today" value={String(orders.filter(o => o.date === new Date().toISOString().split("T")[0]).length)} color="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg bg-card p-5 shadow-card">
          <h3 className="font-semibold text-text-primary mb-4">Orders by Status</h3>
          {ordersByStatus.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={ordersByStatus} innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {ordersByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ordersByStatus.map(s => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-text-secondary capitalize">{s.name}</span>
                    <span className="ml-auto font-medium text-text-primary">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">No orders yet</p>
          )}
        </div>

        <div className="lg:col-span-2 rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Recent Orders</h3>
            <Link to="/admin/orders" className="text-sm text-primary hover:underline">View All</Link>
          </div>
          {isLoading ? (
            <p className="text-text-muted text-sm text-center py-8">Loading...</p>
          ) : orders.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">No orders yet. Create your first order to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-text-secondary">Order ID</th>
                    <th className="pb-2 font-medium text-text-secondary">Customer</th>
                    <th className="pb-2 font-medium text-text-secondary">Status</th>
                    <th className="pb-2 font-medium text-text-secondary">Courier</th>
                    <th className="pb-2 font-medium text-text-secondary">Type</th>
                    <th className="pb-2 font-medium text-text-secondary">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 10).map(o => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                      <td className="py-2.5 font-mono text-xs text-primary">{o.id}</td>
                      <td className="py-2.5 text-text-primary">{o.customer}</td>
                      <td className="py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="py-2.5 text-text-secondary">{o.courier}</td>
                      <td className="py-2.5"><PaymentBadge type={o.payment} /></td>
                      <td className="py-2.5 text-text-muted">{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
