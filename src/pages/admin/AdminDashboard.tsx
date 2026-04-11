import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { Package, CheckCircle2, RotateCcw, AlertTriangle, IndianRupee, Users } from "lucide-react";
import { orders, ordersOverTime, courierPerformance, ordersByStatus } from "@/data/mockData";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Admin", "Dashboard"]} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value="24,891" color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value="19,240" trend="+8.2%" trendUp color="success" />
        <KPICard icon={RotateCcw} label="RTO %" value="11.4%" trend="-2.1%" trendUp color="danger" />
        <KPICard icon={AlertTriangle} label="NDR %" value="7.8%" trend="+0.5%" trendUp={false} color="warning" />
        <KPICard icon={IndianRupee} label="Revenue" value="₹48.2L" trend="+15.3%" trendUp color="tertiary" />
        <KPICard icon={Users} label="Active Dropshippers" value="342" trend="+24" trendUp color="secondary" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Orders Over Time</h3>
            <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary-dark">Last 30 days</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={ordersOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
              <Tooltip />
              <Area type="monotone" dataKey="total" stroke="hsl(var(--color-primary))" fill="hsl(var(--color-primary))" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="delivered" stroke="hsl(var(--color-success))" fill="hsl(var(--color-success))" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="rto" stroke="hsl(var(--color-danger))" fill="hsl(var(--color-danger))" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg bg-card p-5 shadow-card">
          <h3 className="font-semibold text-text-primary mb-4">Courier Performance</h3>
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
        </div>
      </div>

      {/* Orders by Status + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg bg-card p-5 shadow-card">
          <h3 className="font-semibold text-text-primary mb-4">Orders by Status</h3>
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
                <span className="text-text-secondary">{s.name}</span>
                <span className="ml-auto font-medium text-text-primary">{s.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Recent Orders</h3>
            <Link to="/admin/orders" className="text-sm text-primary hover:underline">View All</Link>
          </div>
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
        </div>
      </div>
    </div>
  );
}
