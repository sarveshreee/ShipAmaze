import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { CheckCircle2, Clock, RotateCcw, AlertTriangle, Target, Download, FileText } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMemo } from "react";

const deliveryTrend = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  rate: 82 + Math.floor(Math.random() * 10),
}));
const rtoByCourier = [
  { name: "Delhivery", rto: 8 }, { name: "Blue Dart", rto: 11 }, { name: "DTDC", rto: 14 },
  { name: "Ekart", rto: 9 }, { name: "XpressBees", rto: 12 },
];
const ndrReasons = [
  { name: "Not at Home", value: 35, color: "hsl(var(--color-secondary))" },
  { name: "Rejected", value: 22, color: "hsl(var(--color-danger))" },
  { name: "Wrong Address", value: 18, color: "hsl(var(--color-warning))" },
  { name: "Fake Attempt", value: 15, color: "hsl(var(--color-tertiary))" },
  { name: "Other", value: 10, color: "hsl(var(--color-text-muted))" },
];

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function generateHeatmapData() {
  const weeks = 13; // ~90 days / 7
  const data: { week: number; day: number; count: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      data.push({ week: w, day: d, count: Math.floor(Math.random() * 50) });
    }
  }
  return data;
}

function getHeatColor(count: number, max: number) {
  if (count === 0) return "bg-surface-2";
  const intensity = count / max;
  if (intensity < 0.25) return "bg-primary/20";
  if (intensity < 0.5) return "bg-primary/40";
  if (intensity < 0.75) return "bg-primary/60";
  return "bg-primary/90";
}

export default function AdminAnalytics() {
  const heatmapData = useMemo(() => generateHeatmapData(), []);
  const maxCount = Math.max(...heatmapData.map(d => d.count));

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Analytics" breadcrumb={["Admin", "Analytics"]} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard icon={CheckCircle2} label="Delivery Success" value="84.2%" color="success" />
        <KPICard icon={Clock} label="Avg Delivery Time" value="3.2 days" color="secondary" />
        <KPICard icon={RotateCcw} label="RTO Rate" value="11.4%" color="danger" />
        <KPICard icon={AlertTriangle} label="NDR Rate" value="7.8%" color="warning" />
        <KPICard icon={Target} label="First Attempt" value="72.1%" color="primary" />
      </div>

      {/* Order Volume Heatmap */}
      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-text-primary">Daily Order Volume</h3>
            <p className="text-xs text-text-muted">Last 13 weeks · Darker = more orders</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => toast.success("CSV exported")}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => toast.success("PDF report generated")}>
              <FileText className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col gap-1 pr-2 pt-0">
              {dayLabels.map(d => (
                <div key={d} className="h-[18px] flex items-center text-[10px] text-text-muted font-medium">{d}</div>
              ))}
            </div>
            {/* Grid */}
            {Array.from({ length: 13 }, (_, w) => (
              <div key={w} className="flex flex-col gap-1">
                {Array.from({ length: 7 }, (_, d) => {
                  const cell = heatmapData.find(c => c.week === w && c.day === d);
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
          {/* Legend */}
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
          <h3 className="font-semibold text-text-primary mb-4">Delivery Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={deliveryTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))"/><XAxis dataKey="day" tick={{fontSize:10}} stroke="hsl(var(--color-text-muted))"/><YAxis tick={{fontSize:10}} stroke="hsl(var(--color-text-muted))" domain={[70,100]}/><Tooltip/><Area type="monotone" dataKey="rate" stroke="hsl(var(--color-success))" fill="hsl(var(--color-success))" fillOpacity={0.1} strokeWidth={2}/></AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg bg-card shadow-card p-5">
          <h3 className="font-semibold text-text-primary mb-4">RTO by Courier</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rtoByCourier} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))"/><XAxis type="number" tick={{fontSize:10}} stroke="hsl(var(--color-text-muted))"/><YAxis dataKey="name" type="category" tick={{fontSize:11}} stroke="hsl(var(--color-text-muted))" width={80}/><Tooltip/><Bar dataKey="rto" fill="hsl(var(--color-danger))" radius={[0,4,4,0]}/></BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg bg-card shadow-card p-5">
        <h3 className="font-semibold text-text-primary mb-4">NDR Reasons Breakdown</h3>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ResponsiveContainer width={200} height={200}>
            <PieChart><Pie data={ndrReasons} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">{ndrReasons.map((e,i) => <Cell key={i} fill={e.color}/>)}</Pie><Tooltip/></PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {ndrReasons.map(r => (
              <div key={r.name} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-full shrink-0" style={{backgroundColor: r.color}}/>
                <span className="text-text-secondary">{r.name}</span>
                <span className="font-medium text-text-primary">{r.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
