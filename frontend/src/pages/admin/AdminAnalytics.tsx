import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { CheckCircle2, Clock, RotateCcw, AlertTriangle, Target, Download, FileText } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo, Component, type ErrorInfo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useNdrOrders, useDashboardSummary } from "@/hooks/useApiData";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PIE_COLORS = [
  "hsl(var(--color-secondary))",
  "hsl(var(--color-danger))",
  "hsl(var(--color-warning))",
  "hsl(var(--color-primary))",
  "hsl(var(--color-text-muted))",
];

class ChartErrorBoundary extends Component<{ children: ReactNode }, { err: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { err: false };
  }
  static getDerivedStateFromError() {
    return { err: true };
  }
  override componentDidCatch(_e: Error, _info: ErrorInfo) {
    /* charts: avoid console noise in production */
  }
  override render() {
    if (this.state.err) {
      return (
        <div className="flex h-[240px] items-center justify-center text-sm text-text-muted border border-dashed border-border rounded-lg">
          Chart could not be rendered. Try refreshing or check data.
        </div>
      );
    }
    return this.props.children;
  }
}

function getHeatColor(count: number, max: number) {
  if (count === 0) return "bg-surface-2";
  const safeMax = Math.max(max, 1);
  const intensity = count / safeMax;
  if (intensity < 0.25) return "bg-primary/20";
  if (intensity < 0.5) return "bg-primary/40";
  if (intensity < 0.75) return "bg-primary/60";
  return "bg-primary/90";
}

type AnalyticsSummary = {
  deliveryRatePct: number;
  rtoPct: number;
  ndrPct: number;
  ndrCount: number;
  totalOrders: number;
  totalOrderValue?: number;
  ordersOverTime?: Array<{ date: string; total: number; delivered: number; rto: number }>;
  courierPerformance?: Array<{ name: string; delivered: number; ndr: number; rto: number; total?: number }>;
};

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { data: summary, loading: summaryLoading, error: summaryErr, reload } = useDashboardSummary<AnalyticsSummary>();
  const { data: ndrRows = [], isLoading: ndrLoading, isError: ndrErr, refetch: refetchNdr } = useNdrOrders();

  const ordersOverTime = useMemo(() => {
    const series = summary?.ordersOverTime ?? [];
    if (!series.length) {
      return dayLabels.map((day) => ({ day, orders: 0 }));
    }
    const last7 = series.slice(-7);
    return last7.map((row) => {
      const d = new Date(row.date);
      const day = Number.isNaN(d.getTime())
        ? row.date
        : d.toLocaleDateString("en-IN", { weekday: "short" });
      return { day, orders: row.total ?? 0 };
    });
  }, [summary]);

  const courierPerformance = useMemo(() => {
    const rows = (summary?.courierPerformance ?? [])
      .map((c) => ({ name: c.name, count: c.total ?? c.delivered + c.ndr + c.rto }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return rows.length ? rows : [{ name: "No data", count: 0 }];
  }, [summary]);

  const revenueData = useMemo(() => {
    const series = summary?.ordersOverTime ?? [];
    if (!series.length) return [{ month: "—", revenue: 0 }];
    // Approximate monthly buckets from daily series (value not on series — use order counts as activity proxy)
    const map = new Map<string, number>();
    for (const row of series) {
      const key = String(row.date).slice(0, 7);
      if (!key || key.length < 7) continue;
      map.set(key, (map.get(key) || 0) + (row.total || 0));
    }
    const keys = Array.from(map.keys()).sort();
    const last = keys.slice(-6);
    const rows = last.map((k) => ({ month: k, revenue: map.get(k) ?? 0 }));
    return rows.length ? rows : [{ month: "—", revenue: 0 }];
  }, [summary]);

  const heatmapData = useMemo(() => {
    const weeks = 13;
    const data: { week: number; day: number; count: number }[] = [];
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        data.push({ week: w, day: d, count: 0 });
      }
    }
    const series = summary?.ordersOverTime ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const row of series) {
      const od = new Date(row.date);
      if (Number.isNaN(od.getTime())) continue;
      od.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - od.getTime()) / 86400000);
      if (diffDays < 0 || diffDays >= weeks * 7) continue;
      const w = Math.min(Math.floor(diffDays / 7), weeks - 1);
      const d = (od.getDay() + 6) % 7;
      const cell = data.find((c) => c.week === w && c.day === d);
      if (cell) cell.count += row.total || 0;
    }
    return data;
  }, [summary]);

  const maxCount = useMemo(() => Math.max(1, ...heatmapData.map((d) => d.count)), [heatmapData]);

  const deliveryTrend = useMemo(() => {
    const series = summary?.ordersOverTime ?? [];
    const last14 = series.slice(-14);
    if (!last14.length) {
      return Array.from({ length: 14 }, (_, i) => ({ day: `D${i + 1}`, rate: 0 }));
    }
    return last14.map((row, i) => {
      const total = row.total || 0;
      const rate = total === 0 ? 0 : Math.round(((row.delivered || 0) / total) * 100);
      return { day: `Day ${i + 1}`, rate };
    });
  }, [summary]);

  const rtoByCourier = useMemo(() => {
    const rows = (summary?.courierPerformance ?? [])
      .map((c) => {
        const total = c.total ?? c.delivered + c.ndr + c.rto;
        return {
          name: c.name,
          rto: total ? Math.round((c.rto / total) * 100) : 0,
        };
      })
      .slice(0, 6);
    return rows;
  }, [summary]);

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
    if (summary) {
      return {
        delivery: `${summary.deliveryRatePct ?? 0}%`,
        avgTime: "—",
        rto: `${summary.rtoPct ?? 0}%`,
        ndr: `${summary.ndrPct ?? 0}%`,
        activeNdr: String(summary.ndrCount ?? 0),
      };
    }
    return {
      delivery: "0%",
      avgTime: "—",
      rto: "0%",
      ndr: "0%",
      activeNdr: "0",
    };
  }, [summary]);

  if (summaryLoading || ndrLoading) {
    return <div className="animate-pulse p-8 text-text-muted">Loading analytics…</div>;
  }

  if (summaryErr || ndrErr) {
    return (
      <div className="animate-fade-in-up p-6">
        <PageHeader title="Analytics" breadcrumb={["Admin", "Analytics"]} />
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <p className="text-text-secondary">Could not load analytics data.</p>
          <Button
            variant="outline"
            onClick={() => {
              reload();
              void refetchNdr();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Analytics" breadcrumb={["Admin", "Analytics"]} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard icon={CheckCircle2} label="Delivery success" value={kpis.delivery} color="success" />
        <KPICard icon={Clock} label="Avg delivery time" value={kpis.avgTime} color="secondary" />
        <KPICard icon={RotateCcw} label="RTO rate" value={kpis.rto} color="danger" />
        <KPICard icon={AlertTriangle} label="NDR rate" value={kpis.ndr} color="warning" />
        <KPICard icon={Target} label="Active NDR" value={kpis.activeNdr} color="primary" />
      </div>

      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-text-primary">Order activity heatmap</h3>
            <p className="text-xs text-text-muted">Based on order dates in your system</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => navigate("/admin/reports")}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => navigate("/admin/reports")}
            >
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
          <ChartErrorBoundary>
            <div className="w-full min-h-[260px] min-w-0">
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
          </ChartErrorBoundary>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Orders by courier</h3>
          <ChartErrorBoundary>
            <div className="w-full min-h-[260px] min-w-0">
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
          </ChartErrorBoundary>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">Delivery rate trend (14d)</h3>
          <ChartErrorBoundary>
            <div className="w-full min-h-[260px] min-w-0">
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
          </ChartErrorBoundary>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">RTO % by courier</h3>
          <ChartErrorBoundary>
            <div className="w-full min-h-[260px] min-w-0">
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
          </ChartErrorBoundary>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <h3 className="font-semibold text-text-primary mb-4">Revenue by month (order amounts)</h3>
        <ChartErrorBoundary>
          <div className="w-full min-h-[250px] min-w-0">
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
        </ChartErrorBoundary>
      </div>

      <div className="rounded-lg bg-card shadow-card p-5">
        <h3 className="font-semibold text-text-primary mb-4">NDR reasons</h3>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ChartErrorBoundary>
            <div className="w-[200px] h-[200px] min-w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ndrReasons} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {ndrReasons.map((e, i) => (
                      <Cell key={`${e.name}-${i}`} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartErrorBoundary>
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
