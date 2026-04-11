import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useSupabaseData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const ndrTabs = ["Active", "Initiated", "Closed"] as const;
const reasonColors: Record<string, string> = {
  "Not at Home": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Rejected": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Wrong Address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Fake Attempt": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Incomplete Address": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function AdminNDR() {
  const [tab, setTab] = useState<string>("Active");
  const { data: ndrOrders = [], isLoading } = useNdrOrders();
  const filtered = ndrOrders.filter(n => n.status === tab);

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading NDR data...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="NDR Management" breadcrumb={["Admin", "NDR"]} />
      <div className="flex gap-1 mb-4 border-b border-border">
        {ndrTabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}>{t}
            <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">{ndrOrders.filter(n => n.status === t).length}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No NDR orders" description={`No ${tab.toLowerCase()} NDR orders found`} />
      ) : (
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
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => toast.success(`Re-attempt scheduled for ${n.awb}`)}>Re-attempt</Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-danger" onClick={() => toast.info(`RTO initiated for ${n.awb}`)}>Force RTO</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
