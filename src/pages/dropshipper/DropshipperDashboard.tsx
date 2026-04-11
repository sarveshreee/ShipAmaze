import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { orders, weeklyOrders } from "@/data/mockData";
import { Package, CheckCircle2, Truck, Clock, Wallet, Banknote, Plus, Upload, Link2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";

export default function DropshipperDashboard() {
  const navigate = useNavigate();
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" breadcrumb={["Dropshipper", "Dashboard"]} />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <KPICard icon={Package} label="Total Orders" value="1,248" color="primary" />
        <KPICard icon={CheckCircle2} label="Delivered" value="1,042" color="success" />
        <KPICard icon={Truck} label="In Transit" value="89" color="secondary" />
        <KPICard icon={Clock} label="Pending" value="34" color="warning" />
        <KPICard icon={Wallet} label="Wallet Balance" value="₹12,450" color="tertiary" />
        <KPICard icon={Banknote} label="COD Pending" value="₹8,200" color="accent" />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[{ icon: Plus, label: "Create Order", path: "/dropshipper/create-order" }, { icon: Upload, label: "Bulk Upload", path: "/dropshipper/bulk-upload" }, { icon: Link2, label: "Connect Store", path: "/dropshipper/channels" }, { icon: BarChart3, label: "Analytics", path: "/dropshipper/rates" }].map(a => (
          <Button key={a.label} variant="outline" onClick={() => navigate(a.path)} className="gap-2">
            <a.icon className="h-4 w-4 text-primary"/>{a.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Orders This Week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyOrders}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))"/><XAxis dataKey="day" tick={{fontSize:11}} stroke="hsl(var(--color-text-muted))"/><YAxis tick={{fontSize:11}} stroke="hsl(var(--color-text-muted))"/><Tooltip/><Bar dataKey="orders" fill="hsl(var(--color-primary))" radius={[4,4,0,0]}/></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Performance</h3>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: "Delivery Rate", value: 84, color: "text-success" }, { label: "RTO Rate", value: 11, color: "text-danger" }, { label: "NDR Rate", value: 5, color: "text-warning" }].map(p => (
              <div key={p.label} className="text-center">
                <div className="relative inline-flex items-center justify-center w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90"><circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" stroke="hsl(var(--color-border))"/><circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" stroke="currentColor" className={p.color} strokeDasharray={`${p.value * 2.14} 214`} strokeLinecap="round"/></svg>
                  <span className={`absolute text-lg font-bold ${p.color}`}>{p.value}%</span>
                </div>
                <p className="text-xs text-text-secondary mt-1">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border"><h3 className="font-semibold text-text-primary">Recent Orders</h3></div>
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
      </div>
    </div>
  );
}
