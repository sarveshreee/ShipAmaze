import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { monthlyRevenue, orders } from "@/data/mockData";
import { Download, FileText, BarChart3, TrendingUp, Package, IndianRupee, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { downloadCSV, downloadPDF } from "@/lib/exportUtils";
import { toast } from "sonner";

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

const statusDistribution = [
  { name: 'Delivered', value: 1571, color: 'hsl(var(--color-success))' },
  { name: 'In Transit', value: 389, color: 'hsl(var(--color-primary))' },
  { name: 'RTO', value: 148, color: 'hsl(var(--color-danger))' },
  { name: 'NDR', value: 121, color: 'hsl(var(--color-warning))' },
  { name: 'Pending', value: 111, color: 'hsl(var(--color-text-muted))' },
];

const dateRanges = ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This Year', 'Custom'];

export default function AdminReports() {
  const [tab, setTab] = useState<'overview' | 'courier' | 'zone' | 'orders'>('overview');
  const [dateRange, setDateRange] = useState('Last 30 days');

  const handleExportCSV = () => {
    if (tab === 'courier') {
      downloadCSV('courier_report', ['Courier', 'Orders', 'Delivered', 'RTO', 'NDR', 'Revenue'],
        courierWise.map(c => [c.courier, c.orders, c.delivered, c.rto, c.ndr, `₹${c.revenue}`]));
    } else if (tab === 'zone') {
      downloadCSV('zone_report', ['Zone', 'Orders', 'Delivery Rate', 'Avg Days'],
        zoneWise.map(z => [z.zone, z.orders, `${z.deliveryRate}%`, `${z.avgDays} days`]));
    } else if (tab === 'orders') {
      downloadCSV('orders_report', ['Order ID', 'Customer', 'City', 'Courier', 'Status', 'Amount', 'Date'],
        orders.slice(0, 30).map(o => [o.id, o.customer, o.city, o.courier, o.status, `₹${o.amount}`, o.date]));
    } else {
      downloadCSV('revenue_report', ['Month', 'Revenue', 'Shipping Cost', 'Profit'],
        monthlyRevenue.map(m => [m.month, `₹${m.revenue}`, `₹${m.shipping}`, `₹${m.profit}`]));
    }
    toast.success('CSV exported successfully');
  };

  const handleExportPDF = () => {
    if (tab === 'courier') {
      downloadPDF('courier_report', 'Courier Performance Report',
        ['Courier', 'Orders', 'Delivered', 'RTO', 'NDR', 'Revenue'],
        courierWise.map(c => [c.courier, c.orders, c.delivered, c.rto, c.ndr, `₹${c.revenue.toLocaleString()}`]),
        ['Total Orders: 1,840', 'Avg Delivery Rate: 84.2%', 'Total Revenue: ₹97,100']);
    } else if (tab === 'zone') {
      downloadPDF('zone_report', 'Zone-wise Performance Report',
        ['Zone', 'Orders', 'Delivery Rate', 'Avg Days'],
        zoneWise.map(z => [z.zone, z.orders, `${z.deliveryRate}%`, `${z.avgDays} days`]),
        ['Total Orders: 2,340', 'Best Zone: Zone A (92%)', 'Avg Delivery: 3.2 days']);
    } else if (tab === 'orders') {
      downloadPDF('orders_summary', 'Order Summary Report',
        ['Order ID', 'Customer', 'City', 'Courier', 'Status', 'Amount', 'Date'],
        orders.slice(0, 30).map(o => [o.id, o.customer, o.city, o.courier, o.status, `₹${o.amount.toLocaleString()}`, o.date]),
        [`Total Orders: ${orders.length}`, `Period: ${dateRange}`, 'Report Type: Order Summary']);
    } else {
      downloadPDF('revenue_report', 'Revenue & Profit Report',
        ['Month', 'Revenue', 'Shipping Cost', 'Profit'],
        monthlyRevenue.map(m => [m.month, `₹${m.revenue.toLocaleString()}`, `₹${m.shipping.toLocaleString()}`, `₹${m.profit.toLocaleString()}`]),
        ['Total Revenue: ₹9.7L', 'Avg Monthly Profit: ₹92K', 'Period: 6 Months']);
    }
    toast.success('PDF opened for download');
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Reports & Analytics" breadcrumb={["Admin", "Reports"]} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 border-b border-border">
          {(['overview', 'courier', 'zone', 'orders'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              )}>{t === 'courier' ? 'Courier Wise' : t === 'zone' ? 'Zone Wise' : t === 'orders' ? 'Orders' : 'Overview'}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}
              className="appearance-none bg-card border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-text-primary cursor-pointer">
              {dateRanges.map(d => <option key={d}>{d}</option>)}
            </select>
            <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" />Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard icon={Package} label="Total Shipments" value="2,340" color="primary" trend="+8.2%" />
            <KPICard icon={TrendingUp} label="Delivery Rate" value="84.2%" color="success" trend="+1.5%" />
            <KPICard icon={IndianRupee} label="Total Revenue" value="₹9.7L" color="tertiary" trend="+15.3%" />
            <KPICard icon={BarChart3} label="Avg Order Value" value="₹414" color="secondary" trend="+3.1%" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 rounded-lg bg-card shadow-card p-5">
              <h3 className="font-semibold text-text-primary mb-4">Revenue Trend (6 Months)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--color-primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="shipping" name="Shipping Cost" stroke="hsl(var(--color-danger))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--color-success))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg bg-card shadow-card p-5">
              <h3 className="font-semibold text-text-primary mb-4">Order Status Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {statusDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {statusDistribution.map(s => (
                  <div key={s.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name} ({s.value})
                  </div>
                ))}
              </div>
            </div>
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
                <th className="p-3 text-right font-medium text-text-secondary">Del %</th>
                <th className="p-3 text-right font-medium text-text-secondary">RTO</th>
                <th className="p-3 text-right font-medium text-text-secondary">NDR</th>
                <th className="p-3 text-right font-medium text-text-secondary">Revenue</th>
              </tr></thead>
              <tbody>{courierWise.map(c => (
                <tr key={c.courier} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-medium text-text-primary">{c.courier}</td>
                  <td className="p-3 text-right">{c.orders}</td>
                  <td className="p-3 text-right text-success font-medium">{c.delivered}</td>
                  <td className="p-3 text-right">
                    <span className={cn("font-medium", (c.delivered/c.orders*100) > 85 ? "text-success" : "text-warning")}>
                      {(c.delivered/c.orders*100).toFixed(1)}%
                    </span>
                  </td>
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
              <tr key={z.zone} className="border-b border-border last:border-0 hover:bg-surface-2/30">
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

      {tab === 'orders' && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">City</th>
              <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
              <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            </tr></thead>
            <tbody>{orders.slice(0, 30).map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                <td className="p-3 text-text-primary">{o.customer}</td>
                <td className="p-3 text-text-secondary">{o.city}</td>
                <td className="p-3 text-text-secondary">{o.courier}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", o.payment === 'COD' ? "bg-warning-light text-warning-dark" : "bg-success-light text-success-dark")}>{o.payment}</span></td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                  o.status === 'delivered' ? "bg-success-light text-success-dark" :
                  o.status === 'in-transit' ? "bg-primary-light text-primary-dark" :
                  o.status === 'rto' ? "bg-danger-light text-danger-dark" :
                  o.status === 'ndr' ? "bg-warning-light text-warning-dark" :
                  "bg-surface-2 text-text-muted"
                )}>{o.status}</span></td>
                <td className="p-3 text-right font-medium">₹{o.amount.toLocaleString()}</td>
                <td className="p-3 text-text-muted">{o.date}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
