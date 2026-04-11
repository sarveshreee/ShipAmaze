import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { monthlyRevenue, orders } from "@/data/mockData";
import { Download, FileText, BarChart3, TrendingUp, Package, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { cn } from "@/lib/utils";

const courierWise = [
  { courier: 'Delhivery', orders: 580, delivered: 492, rto: 46, ndr: 42, revenue: 26100 },
  { courier: 'Blue Dart', orders: 420, delivered: 378, rto: 21, ndr: 21, revenue: 31500 },
  { courier: 'DTDC', orders: 340, delivered: 272, rto: 41, ndr: 27, revenue: 17000 },
  { courier: 'Ekart', orders: 290, delivered: 249, rto: 23, ndr: 18, revenue: 13050 },
  { courier: 'XpressBees', orders: 210, delivered: 180, rto: 17, ndr: 13, revenue: 9450 },
];

const zoneWise = [
  { zone: 'Zone A (Local)', orders: 820, deliveryRate: 92, avgDays: 1.5 },
  { zone: 'Zone B (Regional)', orders: 640, deliveryRate: 88, avgDays: 2.8 },
  { zone: 'Zone C (National)', orders: 480, deliveryRate: 82, avgDays: 3.5 },
  { zone: 'Zone D (Special)', orders: 260, deliveryRate: 76, avgDays: 4.2 },
  { zone: 'Zone E (Remote)', orders: 140, deliveryRate: 68, avgDays: 5.8 },
];

export default function AdminReports() {
  const [tab, setTab] = useState<'overview' | 'courier' | 'zone'>('overview');

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Reports" breadcrumb={["Admin", "Reports"]} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 border-b border-border">
          {(['overview', 'courier', 'zone'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
              )}>{t === 'courier' ? 'Courier Wise' : t === 'zone' ? 'Zone Wise' : 'Overview'}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Export PDF</Button>
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" />Export CSV</Button>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard icon={Package} label="Total Shipments" value="2,340" color="primary" />
            <KPICard icon={TrendingUp} label="Delivery Rate" value="84.2%" color="success" />
            <KPICard icon={IndianRupee} label="Total Revenue" value="₹9.7L" color="tertiary" />
            <KPICard icon={BarChart3} label="Avg Order Value" value="₹414" color="secondary" />
          </div>
          <div className="rounded-lg bg-card shadow-card p-5 mb-6">
            <h3 className="font-semibold text-text-primary mb-4">Revenue Trend (6 Months)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--color-primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="shipping" name="Shipping Cost" stroke="hsl(var(--color-danger))" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--color-success))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'courier' && (
        <>
          <div className="rounded-lg bg-card shadow-card p-5 mb-6">
            <h3 className="font-semibold text-text-primary mb-4">Orders by Courier</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={courierWise}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="courier" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                <Tooltip />
                <Legend />
                <Bar dataKey="delivered" name="Delivered" fill="hsl(var(--color-success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rto" name="RTO" fill="hsl(var(--color-danger))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ndr" name="NDR" fill="hsl(var(--color-warning))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg bg-card shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
                <th className="p-3 text-right font-medium text-text-secondary">Orders</th>
                <th className="p-3 text-right font-medium text-text-secondary">Delivered</th>
                <th className="p-3 text-right font-medium text-text-secondary">RTO</th>
                <th className="p-3 text-right font-medium text-text-secondary">NDR</th>
                <th className="p-3 text-right font-medium text-text-secondary">Revenue</th>
              </tr></thead>
              <tbody>{courierWise.map(c => (
                <tr key={c.courier} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium text-text-primary">{c.courier}</td>
                  <td className="p-3 text-right">{c.orders}</td>
                  <td className="p-3 text-right text-success">{c.delivered}</td>
                  <td className="p-3 text-right text-danger">{c.rto}</td>
                  <td className="p-3 text-right text-warning">{c.ndr}</td>
                  <td className="p-3 text-right font-medium">₹{c.revenue.toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'zone' && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Zone</th>
              <th className="p-3 text-right font-medium text-text-secondary">Orders</th>
              <th className="p-3 text-right font-medium text-text-secondary">Delivery Rate</th>
              <th className="p-3 text-right font-medium text-text-secondary">Avg Days</th>
            </tr></thead>
            <tbody>{zoneWise.map(z => (
              <tr key={z.zone} className="border-b border-border last:border-0">
                <td className="p-3 font-medium text-text-primary">{z.zone}</td>
                <td className="p-3 text-right">{z.orders}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-success" style={{ width: `${z.deliveryRate}%` }} />
                    </div>
                    <span className="text-success font-medium">{z.deliveryRate}%</span>
                  </div>
                </td>
                <td className="p-3 text-right text-text-secondary">{z.avgDays} days</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
