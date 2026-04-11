import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { weightDisputes } from "@/data/mockData";
import { Scale, AlertTriangle, CheckCircle2, XCircle, Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  Open: "bg-warning-light text-warning-dark",
  Accepted: "bg-success-light text-success-dark",
  Rejected: "bg-danger-light text-danger-dark",
  Escalated: "bg-tertiary-light text-tertiary-dark",
};

export default function AdminWeightDisputes() {
  const [tab, setTab] = useState<'all' | 'Open' | 'Accepted' | 'Rejected' | 'Escalated'>('all');
  const filtered = tab === 'all' ? weightDisputes : weightDisputes.filter(w => w.status === tab);

  const openCount = weightDisputes.filter(w => w.status === 'Open').length;
  const totalExcess = weightDisputes.reduce((s, w) => s + (w.chargedAmount - w.expectedAmount), 0);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Weight Reconciliation" breadcrumb={["Admin", "Weight Disputes"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Scale} label="Total Disputes" value={String(weightDisputes.length)} color="primary" />
        <KPICard icon={AlertTriangle} label="Open Disputes" value={String(openCount)} color="warning" />
        <KPICard icon={CheckCircle2} label="Resolved" value={String(weightDisputes.filter(w => w.status === 'Accepted').length)} color="success" />
        <KPICard icon={XCircle} label="Excess Charged" value={`₹${totalExcess.toLocaleString()}`} color="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 border-b border-border">
          {['all', 'Open', 'Accepted', 'Rejected', 'Escalated'].map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={cn("px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              )}>{t === 'all' ? 'All' : t}
              {t !== 'all' && <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">{weightDisputes.filter(w => w.status === t).length}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" /><Input placeholder="Search by AWB/Order ID..." className="pl-9 w-56" /></div>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Export</Button>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Dispute ID</th>
            <th className="p-3 text-left font-medium text-text-secondary">Order / AWB</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
            <th className="p-3 text-left font-medium text-text-secondary">Seller Wt</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier Wt</th>
            <th className="p-3 text-left font-medium text-text-secondary">Diff</th>
            <th className="p-3 text-right font-medium text-text-secondary">Charged</th>
            <th className="p-3 text-right font-medium text-text-secondary">Expected</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(w => (
              <tr key={w.id} className="border-b border-border last:border-0 hover:bg-surface-2/30 transition-colors">
                <td className="p-3 font-mono text-xs text-primary">{w.id}</td>
                <td className="p-3">
                  <p className="font-medium text-text-primary">{w.orderId}</p>
                  <p className="text-xs text-text-muted">{w.awb}</p>
                </td>
                <td className="p-3 text-text-secondary">{w.courier}</td>
                <td className="p-3 text-text-primary font-medium">{w.sellerWeight}</td>
                <td className="p-3 text-danger font-medium">{w.courierWeight}</td>
                <td className="p-3 text-danger font-medium">+{w.diff}</td>
                <td className="p-3 text-right text-danger font-medium">₹{w.chargedAmount}</td>
                <td className="p-3 text-right text-text-primary">₹{w.expectedAmount}</td>
                <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusColors[w.status])}>{w.status}</span></td>
                <td className="p-3">
                  {w.status === 'Open' ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-xs h-7">Accept</Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 text-danger border-danger/30 hover:bg-danger-light">Dispute</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-xs h-7">View</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
