import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { Package, CheckCircle2, RotateCcw, AlertTriangle, IndianRupee, Users, Store, Truck } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { Link } from "react-router-dom";
import { useOrders } from "@/hooks/useApiData";
import { apiClient } from "@/lib/apiClient";
import type { Order } from "@/types/logistics";

type DashboardSummary = {
  activeVendors: number;
  activeDropshippers: number;
  topProducts: Array<{ name: string; orderCount: number; revenue: number }>;
  topVendors: Array<{ name: string; email: string; orderCount: number; revenue: number }>;
  topDropshippers: Array<{ name: string; email: string; orderCount: number; revenue: number }>;
};

function useDashboardSummary() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiClient.get<DashboardSummary>("/dashboard/summary")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

const STATUS_COLORS: Record<string, string> = {
  delivered: "hsl(var(--color-success))",
  "in-transit": "hsl(var(--color-secondary))",
  ndr: "hsl(var(--color-warning))",
  rto: "hsl(var(--color-danger))",
  pending: "hsl(var(--color-tertiary))",
  cancelled: "hsl(var(--color-text-muted))",
};

function aggregateByDate(orders: Order[]) {
  const byDate = new Map<string, { date: string; total: number; delivered: number; rto: number }>();
  for (const o of orders) {
    const d = o.date || "—";
    const cur = byDate.get(d) || { date: d, total: 0, delivered: 0, rto: 0 };
    cur.total += 1;
    if (o.status === "delivered") cur.delivered += 1;
    if (o.status === "rto") cur.rto += 1;
    byDate.set(d, cur);
  }
  return [...byDate.values()].slice(-30);
}

function aggregateByCourier(orders: Order[]) {
  const m = new Map<string, { name: string; delivered: number; ndr: number; rto: number }>();
  for (const o of orders) {
    const c = o.courier || "Unknown";
    const cur = m.get(c) || { name: c, delivered: 0, ndr: 0, rto: 0 };
    if (o.status === "delivered") cur.delivered += 1;
    if (o.status === "ndr") cur.ndr += 1;
    if (o.status === "rto") cur.rto += 1;
    m.set(c, cur);
  }
  return [...m.values()];
}

export default function AdminDashboard() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: summary } = useDashboardSummary();

  const total = orders.length;
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const rtoPct = total ? ((orders.filter((o) => o.status === "rto").length / total) * 100).toFixed(1) : "0";
  const ndrPct = total ? ((orders.filter((o) => o.status === "ndr").length / total) * 100).toFixed(1) : "0";
  const revenue = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);

  const ordersOverTime = useMemo(() => aggregateByDate(orders), [orders]);
  const courierPerformance = useMemo(() => aggregateByCourier(orders), [orders]);
  const ordersByStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const k = o.status || "other";
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || "hsl(var(--color-text-muted))",
    }));
  }, [orders]);

  const recent = orders.slice(0, 10);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Admin", "Dashboard"]} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value={isLoading ? "…" : String(total)} color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value={isLoading ? "…" : String(delivered)} color="success" />
        <KPICard icon={RotateCcw} label="RTO %" value={`${rtoPct}%`} color="danger" />
        <KPICard icon={AlertTriangle} label="NDR %" value={`${ndrPct}%`} color="warning" />
        <KPICard icon={IndianRupee} label="Order value" value={isLoading ? "…" : `₹${(revenue / 100000).toFixed(2)}L`} color="tertiary" />
        <KPICard icon={Store} label="Active Vendors" value={summary ? String(summary.activeVendors) : "—"} color="secondary" />
        <KPICard icon={Users} label="Active Dropshippers" value={summary ? String(summary.activeDropshippers) : "—"} color="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Orders Over Time</h3>
            <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary-dark">By order date</span>
          </div>
          {ordersOverTime.length === 0 ? (
            <p className="text-sm text-text-muted py-16 text-center">No orders yet — charts will populate once orders exist.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={ordersOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--color-primary))"
                  fill="hsl(var(--color-primary))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  stroke="hsl(var(--color-success))"
                  fill="hsl(var(--color-success))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="rto"
                  stroke="hsl(var(--color-danger))"
                  fill="hsl(var(--color-danger))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg bg-card p-5 shadow-card">
          <h3 className="font-semibold text-text-primary mb-4">Courier Performance</h3>
          {courierPerformance.length === 0 ? (
            <p className="text-sm text-text-muted py-16 text-center">No courier data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={courierPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Bar dataKey="delivered" fill="hsl(var(--color-success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ndr" fill="hsl(var(--color-warning))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rto" fill="hsl(var(--color-danger))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg bg-card p-5 shadow-card">
          <h3 className="font-semibold text-text-primary mb-4">Orders by Status</h3>
          {ordersByStatus.length === 0 ? (
            <p className="text-sm text-text-muted py-12 text-center">No status breakdown yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={ordersByStatus} innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {ordersByStatus.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ordersByStatus.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-text-secondary">{s.name}</span>
                    <span className="ml-auto font-medium text-text-primary">{s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Recent Orders</h3>
            <Link to="/admin/orders" className="text-sm text-primary hover:underline">
              View All
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No orders found.</p>
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
                  {recent.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="py-2.5 font-mono text-xs text-primary">{o.id}</td>
                      <td className="py-2.5 text-text-primary">{o.customer}</td>
                      <td className="py-2.5">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="py-2.5 text-text-secondary">{o.courier}</td>
                      <td className="py-2.5">
                        <PaymentBadge type={o.payment} />
                      </td>
                      <td className="py-2.5 text-text-muted">{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Performance Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Top Products */}
        <div className="rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-text-primary">Top Products</h3>
          </div>
          {!summary?.topProducts?.length ? (
            <p className="text-sm text-text-muted py-6 text-center">No product data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-text-secondary">Product</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Orders</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Revenue</th>
              </tr></thead>
              <tbody>
                {summary.topProducts.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 text-text-primary max-w-[120px] truncate">{p.name || "—"}</td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">{p.orderCount}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">₹{p.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Vendors */}
        <div className="rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Store className="h-4 w-4 text-secondary" />
            <h3 className="font-semibold text-text-primary">Top Vendors</h3>
          </div>
          {!summary?.topVendors?.length ? (
            <p className="text-sm text-text-muted py-6 text-center">No vendor data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-text-secondary">Vendor</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Orders</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Revenue</th>
              </tr></thead>
              <tbody>
                {summary.topVendors.map((v, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 max-w-[120px]">
                      <div className="text-text-primary truncate">{v.name}</div>
                      <div className="text-[10px] text-text-muted truncate">{v.email}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">{v.orderCount}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">₹{v.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Dropshippers */}
        <div className="rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-tertiary" />
            <h3 className="font-semibold text-text-primary">Top Dropshippers</h3>
          </div>
          {!summary?.topDropshippers?.length ? (
            <p className="text-sm text-text-muted py-6 text-center">No dropshipper data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-text-secondary">Dropshipper</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Orders</th>
                <th className="pb-2 font-medium text-text-secondary text-right">Revenue</th>
              </tr></thead>
              <tbody>
                {summary.topDropshippers.map((d, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 max-w-[120px]">
                      <div className="text-text-primary truncate">{d.name}</div>
                      <div className="text-[10px] text-text-muted truncate">{d.email}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">{d.orderCount}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">₹{d.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
