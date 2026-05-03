import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { CheckCircle2, Clock, RotateCcw, AlertTriangle, Target, Download, FileText } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMemo } from "react";
import { useOrders, useNdrOrders } from "@/hooks/useApiData";
import type { Order } from "@/types/logistics";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PIE_COLORS = [
  "hsl(var(--color-secondary))",
  "hsl(var(--color-danger))",
  "hsl(var(--color-warning))",
  "hsl(var(--color-primary))",
  "hsl(var(--color-text-muted))",
];

function getHeatColor(count: number, max: number) {
  if (count === 0) return "bg-surface-2";
  const safeMax = Math.max(max, 1);
  const intensity = count / safeMax;
  if (intensity < 0.25) return "bg-primary/20";
  if (intensity < 0.5) return "bg-primary/40";
  if (intensity < 0.75) return "bg-primary/60";
  return "bg-primary/90";
}

export default function AdminAnalytics() {
  const { data: orders = [], isLoading: ordersLoading } = useOrders();
  const { data: ndrRows = [], isLoading: ndrLoading } = useNdrOrders();

  const ordersOverTime = useMemo(() => {
    const days = 7;
    const labels: string[] = [];
    const counts = new Array(days).fill(0);
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString("en-IN", { weekday: "short" }));
    }
    for (const o of orders) {
      if (!o.date) continue;
      const od = new Date(o.date);
      if (Number.isNaN(od.getTime())) continue;
      const diff = Math.floor((today.getTime() - od.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < days) counts[days - 1 - diff] += 1;
    }
    return labels.map((day, i) => ({ day, orders: counts[i] }));
  }, [orders]);

  const courierPerformance = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const name = (o.courier || "Unknown").trim() || "Unknown";
      map.set(name, (map.get(name) || 0) + 1);
    }
    const rows = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return rows.length ? rows : [{ name: "No data", count: 0 }];
  }, [orders]);

  const revenueData = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (!o.date) continue;
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + (Number(o.amount) || 0));
    }
    const keys = Array.from(map.keys()).sort();
    const last = keys.slice(-6);
    const rows = last.map((k) => ({ month: k, revenue: map.get(k) ?? 0 }));
    return rows.length ? rows : [{ month: "—", revenue: 0 }];
  }, [orders]);

  const heatmapData = useMemo(() => {
    const weeks = 13;
    const data: { week: number; day: number; count: number }[] = [];
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        data.push({ week: w, day: d, count: 0 });
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const o of orders) {
      if (!o.date) continue;
      const od = new Date(o.date);
      if (Number.isNaN(od.getTime())) continue;
      od.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - od.getTime()) / 86400000);
      if (diffDays < 0 || diffDays >= weeks * 7) continue;
      const w = Math.min(Math.floor(diffDays / 7), weeks - 1);
      const d = od.getDay();
      const cell = data.find((c) => c.week === w && c.day === d);
      if (cell) cell.count += 1;
    }
    return data;
  }, [orders]);

  const maxCount = useMemo(() => Math.max(1, ...heatmapData.map((d) => d.count)), [heatmapData]);

  const deliveryTrend = useMemo(() => {
    const out: { day: string; rate: number }[] = [];
    for (let i = 0; i < 14; i++) {
      out.push({ day: `D${i + 1}`, rate: 0 });
    }
    const windowDays = 14;
    const today = new Date();
    for (let i = 0; i < windowDays; i++) {
      const dayOrders = orders.filter((o) => {
        if (!o.date) return false;
        const od = new Date(o.date);
        if (Number.isNaN(od.getTime())) return false;
        const diff = Math.floor((today.getTime() - od.getTime()) / (1000 * 60 * 60 * 24));
        return diff === windowDays - 1 - i;
      });
      const total = dayOrders.length;
      const delivered = dayOrders.filter((o) => o.status === "delivered").length;
      const rate = total === 0 ? 0 : Math.round((delivered / total) * 100);
      out[i] = { day: `Day ${i + 1}`, rate };
    }
    return out;
  }, [orders]);

  const rtoByCourier = useMemo(() => {
    const map = new Map<string, { total: number; rto: number }>();
    for (const o of orders) {
      const name = (o.courier || "Unknown").trim() || "Unknown";
      const row = map.get(name) || { total: 0, rto: 0 };
      row.total += 1;
      if (o.status === "rto") row.rto += 1;
      map.set(name, row);
    }
    return Array.from(map.entries())
      .map(([name, { total, rto }]) => ({
        name,
        rto: total ? Math.round((rto / total) * 100) : 0,
      }))
      .filter((x) => x.name !== "No data")
      .slice(0, 6);
  }, [orders]);

  const rtoChartData = rtoByCourier.length ? rtoByCourier : [{ name: "No data", rto: 0 }];

  const ndrReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of ndrRows) {
      const r = (n.reason || "Other").trim() || "Other";
      map.set(r, (map.get(r) || 0) + 1);
    }
    const entries = Array.from(map.entries());
    if (!entries.length) return [{ name: "No NDR data", value: 1, color: "hsl(var(--color-text-muted) / 0.35)" }];
    return entries.map(([name, value], i) => ({
      name,
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [ndrRows]);

  const kpis = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter((o: Order) => o.status === "delivered").length;
    const rto = orders.filter((o) => o.status === "rto").length;
    const rate = total ? ((delivered / total) * 100).toFixed(1) : "0";
    const rtoRate = total ? ((rto / total) * 100).toFixed(1) : "0";
    const ndrCount = ndrRows.length;
    const ndrRate = total ? ((ndrCount / Math.max(total, 1)) * 100).toFixed(1) : "0";
    const firstAttempt = total ? Math.min(99, Math.max(0, 100 - Number(ndrRate))).toFixed(1) : "0";
    return {
      delivery: `${rate}%`,
      avgTime: "—",
      rto: `${rtoRate}%`,
      ndr: `${ndrRate}%`,
      firstAttempt: `${firstAttempt}%`,
    };
  }, [orders, ndrRows]);

  if (ordersLoading || ndrLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading analytics…</div>;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Analytics" breadcrumb={["Admin", "Analytics"]} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard icon={CheckCircle2} label="Delivery success" value={kpis.delivery} color="success" />
        <KPICard icon={Clock} label="Avg delivery time" value={kpis.avgTime} color="secondary" />
        <KPICard icon={RotateCcw} label="RTO rate" value={kpis.rto} color="danger" />
        <KPICard icon={AlertTriangle} label="NDR rate" value={kpis.ndr} color="warning" />
        <KPICard icon={Target} label="First attempt" value={kpis.firstAttempt} color="primary" />
      </div>

      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-text-primary">Order activity heatmap</h3>
            <p className="text-xs text-text-muted">Based on order dates in your system</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => toast.success("Export uses live orders in Reports")}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => toast.info("Use Reports for PDF export")}>
              <FileText className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 pr-2 pt-0">
              {dayLabels.map((d) => (
                <div key={d} className="h-[18px] flex items-center text-[10px] text-text-muted font-medium">
                  {d}
                </div>
              ))}
            </div>
            {Array.from({ length: 13 }, (_, w) => (
              <div key={w} className="flex flex-col gap-1">
                {Array.from({ length: 7 }, (_, d) => {
                  const cell = heatmapData.find((c) => c.week === w && c.day === d);
                  const count = cell?.count ?? 0;
                  return (
                    <div
                      key={d}
                      title={`Week ${w + 1}, ${dayLabels[d]}: ${count} orders`}
                      className={cn("w-[18px] h-[18px] rounded-[3px] transition-colors cursor-default", getHeatColor(count, maxCount))}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-text-muted">
            <span>Less</span>
            <div className="w-3 h-3 rounded-sm bg-surface-2" />
            <div className="w-3 h-3 rounded-sm bg-primary/20" />
            <div className="w-3 h-3 rounded-sm bg-primary/40" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary/90" />
            <span>More</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Orders (last 7 days)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={ordersOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="orders" stroke="hsl(var(--color-success))" fill="hsl(var(--color-success))" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Orders by courier</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={courierPerformance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--color-primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Delivery rate trend (14d)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={deliveryTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="hsl(var(--color-text-muted))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
              <Tooltip />
              <Area type="monotone" dataKey="rate" stroke="hsl(var(--color-success))" fill="hsl(var(--color-success))" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">RTO % by courier</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rtoChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" width={90} />
              <Tooltip />
              <Bar dataKey="rto" fill="hsl(var(--color-danger))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <h3 className="font-semibold text-text-primary mb-4">Revenue by month (order amounts)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
            <Tooltip />
            <Bar dataKey="revenue" fill="hsl(var(--color-secondary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg bg-card shadow-card p-5">
        <h3 className="font-semibold text-text-primary mb-4">NDR reasons</h3>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie data={ndrReasons} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {ndrReasons.map((e, i) => (
                  <Cell key={`${e.name}-${i}`} fill={e.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {ndrReasons.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-text-secondary">{r.name}</span>
                <span className="font-medium text-text-primary">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
