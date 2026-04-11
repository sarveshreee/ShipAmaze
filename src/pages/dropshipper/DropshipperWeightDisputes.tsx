import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { weightDisputes } from "@/data/mockData";
import { Scale, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  Open: "bg-warning-light text-warning-dark",
  Accepted: "bg-success-light text-success-dark",
  Rejected: "bg-danger-light text-danger-dark",
  Escalated: "bg-tertiary-light text-tertiary-dark",
};

export default function DropshipperWeightDisputes() {
  const [tab, setTab] = useState('all');
  const filtered = tab === 'all' ? weightDisputes : weightDisputes.filter(w => w.status === tab);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Weight Disputes" breadcrumb={["Dropshipper", "Weight Disputes"]} />

      <div className="rounded-xl bg-card shadow-card p-5 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-light">
            <Scale className="h-5 w-5 text-warning-dark" />
          </div>
          <div>
            <p className="text-sm text-text-muted">Open Disputes</p>
            <p className="text-xl font-bold text-text-primary">{weightDisputes.filter(w => w.status === 'Open').length}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-border mx-2" />
        <div>
          <p className="text-sm text-text-muted">Total Excess Charged</p>
          <p className="text-xl font-bold text-danger">₹{weightDisputes.reduce((s, w) => s + (w.chargedAmount - w.expectedAmount), 0).toLocaleString()}</p>
        </div>
        <div className="ml-auto">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" /><Input placeholder="Search by AWB..." className="pl-9 w-48" /></div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-4">
        {['all', 'Open', 'Accepted', 'Rejected', 'Escalated'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
            )}>{t === 'all' ? 'All' : t}</button>
        ))}
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Order</th>
            <th className="p-3 text-left font-medium text-text-secondary">AWB</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
            <th className="p-3 text-left font-medium text-text-secondary">Your Wt</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier Wt</th>
            <th className="p-3 text-right font-medium text-text-secondary">Charged</th>
            <th className="p-3 text-right font-medium text-text-secondary">Expected</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(w => (
              <tr key={w.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{w.orderId}</td>
                <td className="p-3 font-mono text-xs text-text-muted">{w.awb}</td>
                <td className="p-3 text-text-secondary">{w.courier}</td>
                <td className="p-3 text-text-primary">{w.sellerWeight}</td>
                <td className="p-3 text-danger font-medium">{w.courierWeight}</td>
                <td className="p-3 text-right text-danger">₹{w.chargedAmount}</td>
                <td className="p-3 text-right text-text-primary">₹{w.expectedAmount}</td>
                <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusColors[w.status])}>{w.status}</span></td>
                <td className="p-3">
                  {w.status === 'Open' && <Button size="sm" variant="outline" className="text-xs h-7 text-danger border-danger/30 hover:bg-danger-light">Raise Dispute</Button>}
                  {w.status !== 'Open' && <Button size="sm" variant="ghost" className="text-xs h-7">View</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
