import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { AlertTriangle, Download, Phone, RotateCcw, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import * as ndrService from "@/services/ndrService";
import { Input } from "@/components/ui/input";

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
  const [search, setSearch] = useState("");
  const { data: ndrOrders = [], isLoading, refetch } = useNdrOrders();
  const filtered = ndrOrders.filter((n) => {
    if (n.status !== tab) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [n.awb, n.customer, n.phone, n.seller, n.reason, n.nextAction]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
  });

  const handleAction = async (awb: string, action: string) => {
    try {
      const newStatus = action === "Force RTO" ? "Closed" : "Initiated";
      await ndrService.updateNdr(awb, { status: newStatus, nextAction: action });
      toast.success(`${action} scheduled for ${awb}`);
      refetch();
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleExport = () => {
    downloadCSV("ndr_export",
      ["AWB", "Customer", "Seller", "Reason", "Attempts", "Status", "Last Update"],
      filtered.map(n => [n.awb, n.customer, n.seller, n.reason, n.attempts, n.status, n.lastUpdate])
    );
    toast.success(`Exported ${filtered.length} NDR records`);
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading NDR data...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="NDR Management" breadcrumb={["Admin", "NDR"]}
        actions={<Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" />Export</Button>}
      />
      <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-5 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
        <div>
          <p className="font-medium text-warning-dark">{ndrOrders.filter((n) => n.status === "Active").length} active NDR cases need action</p>
          <p className="text-sm text-text-secondary">Re-attempt or force RTO after checking customer reachability and delivery reason.</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b border-border">
          {ndrTabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              )}>{t}
              <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">{ndrOrders.filter(n => n.status === t).length}</span>
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search AWB, customer, seller..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
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
                    {n.status === 'Active' ? (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => window.open(`tel:${n.phone}`, "_self")}><Phone className="h-3 w-3" />Call</Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleAction(n.awb, 'Re-attempt')}><Send className="h-3 w-3" />Re-attempt</Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-danger gap-1" onClick={() => handleAction(n.awb, 'Force RTO')}><RotateCcw className="h-3 w-3" />Force RTO</Button>
                      </>
                    ) : (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                        n.status === 'Closed' ? 'bg-surface-2 text-text-muted' : 'bg-secondary-light text-secondary-dark'
                      )}>{n.status}</span>
                    )}
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
