import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { Package, CheckCircle2, RotateCcw, AlertTriangle, IndianRupee, Users, Store, Truck, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Link } from "react-router-dom";
import { useDashboardSummary } from "@/hooks/useApiData";
import { DashboardEntityRow } from "@/components/DashboardEntityRow";
import { Button } from "@/components/ui/button";

type DashboardSummary = {
  totalOrders: number;
  deliveredCount: number;
  rtoPct: number;
  ndrPct: number;
  totalOrderValue: number;
  ordersOverTime: Array<{ date: string; total: number; delivered: number; rto: number }>;
  courierPerformance: Array<{ name: string; delivered: number; ndr: number; rto: number }>;
  ordersByStatus: Array<{ name: string; value: number }>;
  recentOrders: Array<{ id: string; customer: string; status: string; courier: string; payment: string; date: string }>;
  activeVendors: number;
  activeDropshippers: number;
  topProducts: Array<{ name: string; orderCount: number; revenue: number }>;
  topVendors: Array<{ name: string; email: string; orderCount: number; revenue: number }>;
  topDropshippers: Array<{ name: string; email: string; orderCount: number; revenue: number }>;
};

const STATUS_COLORS: Record<string, string> = {
  delivered: "#10b981",
  shipped: "#0ea5e9",
  "in-transit": "#06b6d4",
  in_transit: "#06b6d4",
  "out-for-delivery": "#8b5cf6",
  out_for_delivery: "#8b5cf6",
  ndr: "#f59e0b",
  rto: "#ef4444",
  pending: "#f97316",
  pending_pickup: "#fb923c",
  ready_to_ship: "#6366f1",
  "ready-to-ship": "#6366f1",
  reship: "#64748b",
  cancelled: "#94a3b8",
  picked_up: "#14b8a6",
  pickup_scheduled: "#22d3ee",
};

const CHART = {
  primary: "#f97316",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  secondary: "#14b8a6",
  tertiary: "#8b5cf6",
};

export default function AdminDashboard() {
  const { data: summary, loading: isLoading, error, reload } = useDashboardSummary<DashboardSummary>();
  const total = summary?.totalOrders ?? 0;
  const delivered = summary?.deliveredCount ?? 0;
  const rtoPct = summary?.rtoPct ?? 0;
  const ndrPct = summary?.ndrPct ?? 0;
  const revenue = summary?.totalOrderValue ?? 0;

  const ordersOverTime = summary?.ordersOverTime ?? [];
  const courierPerformance = summary?.courierPerformance ?? [];
  const ordersByStatus = useMemo(() => {
    return (summary?.ordersByStatus ?? []).map(({ name, value }) => ({
      name,
      value,
      color: STATUS_COLORS[name] || "#94a3b8",
    }));
  }, [summary?.ordersByStatus]);

  const recent = summary?.recentOrders ?? [];

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Dashboard"
        breadcrumb={["Admin", "Dashboard"]}
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={() => reload()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-light/40 px-4 py-3 text-sm text-danger-dark flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" className="underline font-medium" onClick={() => reload()}>Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value={isLoading ? "…" : String(total)} color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value={isLoading ? "…" : String(delivered)} color="success" />
        <KPICard icon={RotateCcw} label="RTO %" value={isLoading ? "…" : `${rtoPct}%`} color="danger" />
        <KPICard icon={AlertTriangle} label="NDR %" value={isLoading ? "…" : `${ndrPct}%`} color="warning" />
        <KPICard icon={IndianRupee} label="Order value" value={isLoading ? "…" : `₹${(revenue / 100000).toFixed(2)}L`} color="accent" />
        <KPICard icon={Store} label="Active Vendors" value={isLoading ? "…" : String(summary?.activeVendors ?? 0)} color="secondary" />
        <KPICard icon={Users} label="Active Dropshippers" value={isLoading ? "…" : String(summary?.activeDropshippers ?? 0)} color="tertiary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="font-semibold text-text-primary">Orders Over Time</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">By order date</span>
          </div>
          <div className="p-5 pt-4">
          {ordersOverTime.length === 0 ? (
            <p className="text-sm text-text-muted py-16 text-center">No orders yet — charts will populate once orders exist.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={ordersOverTime}>
                <defs>
                  <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART.primary} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.success} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART.success} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Area type="monotone" dataKey="total" name="Total" stroke={CHART.primary} fill="url(#fillTotal)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="delivered" name="Delivered" stroke={CHART.success} fill="url(#fillDelivered)" strokeWidth={2} />
                <Area type="monotone" dataKey="rto" name="RTO" stroke={CHART.danger} fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="font-semibold text-text-primary">Courier Performance</h3>
          </div>
          <div className="p-5 pt-4">
          {courierPerformance.length === 0 ? (
            <p className="text-sm text-text-muted py-16 text-center">No courier data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={courierPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Legend />
                <Bar dataKey="delivered" name="Delivered" fill={CHART.success} radius={[6, 6, 0, 0]} />
                <Bar dataKey="ndr" name="NDR" fill={CHART.warning} radius={[6, 6, 0, 0]} />
                <Bar dataKey="rto" name="RTO" fill={CHART.danger} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="font-semibold text-text-primary">Orders by Status</h3>
          </div>
          <div className="p-5 pt-4">
          {ordersByStatus.length === 0 ? (
            <p className="text-sm text-text-muted py-12 text-center">No status breakdown yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={ordersByStatus} innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                    {ordersByStatus.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--color-card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ordersByStatus.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs rounded-lg bg-surface-2/60 px-2 py-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/80" style={{ backgroundColor: s.color }} />
                    <span className="text-text-secondary capitalize">{s.name.replace(/_/g, " ")}</span>
                    <span className="ml-auto font-semibold text-text-primary">{s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          </div>
        </div>

        <div className="lg:col-span-2 dashboard-card">
          <div className="dashboard-card-header">
            <h3 className="font-semibold text-text-primary">Recent Orders</h3>
            <Link to="/admin/orders" className="text-sm font-semibold text-primary hover:underline">
              View All
            </Link>
          </div>
          <div className="p-5 pt-2">
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
                        <PaymentBadge type={o.payment as "COD" | "Prepaid"} />
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
      </div>

      {/* Performance Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="dashboard-card">
          <div className="dashboard-card-header gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-text-primary">Top Products</h3>
          </div>
          <div className="p-5 pt-3">
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
                  <DashboardEntityRow
                    key={`${p.name}-${i}`}
                    rank={i}
                    name={p.name || "Unnamed product"}
                    orderCount={p.orderCount}
                    revenue={p.revenue}
                  />
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header gap-2">
            <Store className="h-4 w-4 text-secondary" />
            <h3 className="font-semibold text-text-primary">Top Vendors</h3>
          </div>
          <div className="p-5 pt-3">
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
                  <DashboardEntityRow
                    key={`${v.name}-${i}`}
                    rank={i}
                    name={v.name}
                    subtitle={v.email}
                    orderCount={v.orderCount}
                    revenue={v.revenue}
                  />
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header gap-2">
            <Truck className="h-4 w-4 text-tertiary" />
            <h3 className="font-semibold text-text-primary">Top Dropshippers</h3>
          </div>
          <div className="p-5 pt-3">
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
                  <DashboardEntityRow
                    key={`${d.name}-${i}`}
                    rank={i}
                    name={d.name}
                    subtitle={d.email}
                    orderCount={d.orderCount}
                    revenue={d.revenue}
                  />
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
