import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ndrOrders } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ndrTabs = ["Active", "Initiated", "Closed"] as const;
const reasonColors: Record<string, string> = {
  "Not at Home": "bg-secondary-light text-secondary-dark",
  "Rejected": "bg-danger-light text-danger-dark",
  "Wrong Address": "bg-warning-light text-warning-dark",
  "Fake Attempt": "bg-danger-light text-danger-dark",
  "Incomplete Address": "bg-tertiary-light text-tertiary-dark",
};

export default function AdminNDR() {
  const [tab, setTab] = useState<string>("Active");
  const filtered = ndrOrders.filter(n => n.status === tab);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="NDR Management" breadcrumb={["Admin", "NDR"]} />
      <div className="flex gap-1 mb-4 border-b border-border">
        {ndrTabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}>{t}</button>
        ))}
      </div>
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">AWB</th>
            <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
            <th className="p-3 text-left font-medium text-text-secondary">Seller</th>
            <th className="p-3 text-left font-medium text-text-secondary">Reason</th>
            <th className="p-3 text-left font-medium text-text-secondary">Attempts</th>
            <th className="p-3 text-left font-medium text-text-secondary">Last Update</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(n => (
              <tr key={n.awb} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{n.awb}</td>
                <td className="p-3 text-text-primary">{n.customer}</td>
                <td className="p-3 text-text-secondary">{n.seller}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", reasonColors[n.reason] || "bg-surface-2 text-text-secondary")}>{n.reason}</span></td>
                <td className="p-3 text-text-secondary">{n.attempts}</td>
                <td className="p-3 text-text-muted">{n.lastUpdate}</td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-7">Re-attempt</Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 text-danger">Force RTO</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
