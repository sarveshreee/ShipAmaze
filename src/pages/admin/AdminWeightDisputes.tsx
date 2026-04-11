import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { useWeightDisputes } from "@/hooks/useSupabaseData";
import { Scale, AlertTriangle, CheckCircle2, XCircle, Search, Download, ChevronDown, ChevronRight, Upload, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Accepted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Escalated: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function AdminWeightDisputes() {
  const [tab, setTab] = useState<'all' | 'Open' | 'Accepted' | 'Rejected' | 'Escalated'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { data: weightDisputes = [], isLoading } = useWeightDisputes();
  const filtered = tab === 'all' ? weightDisputes : weightDisputes.filter(w => w.status === tab);
  const openCount = weightDisputes.filter(w => w.status === 'Open').length;
  const totalExcess = weightDisputes.reduce((s, w) => s + (w.chargedAmount - w.expectedAmount), 0);

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading disputes...</div>;

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
          <Button variant="outline" size="sm" onClick={() => toast.success("Disputes exported")}><Download className="h-4 w-4 mr-1" />Export</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Scale} title="No disputes found" description="No weight disputes match the current filter" actionLabel="Show All" onAction={() => setTab('all')} />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 w-8"></th>
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">AWB</th>
              <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
              <th className="p-3 text-left font-medium text-text-secondary">Reported Wt</th>
              <th className="p-3 text-left font-medium text-text-secondary">Actual Wt</th>
              <th className="p-3 text-left font-medium text-text-secondary">Difference</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(w => (
                <>
                  <tr key={w.id} className={cn("border-b border-border hover:bg-surface-2/30 transition-colors cursor-pointer", expandedRow === w.id && "bg-surface-2/20")}
                    onClick={() => setExpandedRow(expandedRow === w.id ? null : w.id)}>
                    <td className="p-3 text-text-muted">{expandedRow === w.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="p-3 font-medium text-text-primary">{w.orderId}</td>
                    <td className="p-3 font-mono text-xs text-primary">{w.awb}</td>
                    <td className="p-3 text-text-secondary">{w.courier}</td>
                    <td className="p-3 text-danger font-medium">{w.courierWeight}</td>
                    <td className="p-3 text-text-primary font-medium">{w.sellerWeight}</td>
                    <td className="p-3 text-danger font-medium">+{w.diff}</td>
                    <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusColors[w.status])}>{w.status}</span></td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      {w.status === 'Open' ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => toast.success(`Dispute ${w.id} accepted`)}>Accept</Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 text-purple-600 border-purple-300 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-700 dark:hover:bg-purple-900/20" onClick={() => toast.info(`Dispute ${w.id} escalated`)}>Escalate</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toast.info(`Viewing dispute ${w.id}`)}>View</Button>
                      )}
                    </td>
                  </tr>
                  {expandedRow === w.id && (
                    <tr key={`${w.id}-expand`} className="border-b border-border bg-surface-2/10">
                      <td colSpan={9} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Dispute Details</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="rounded-lg border border-border p-3"><p className="text-[10px] font-medium uppercase text-text-muted">Dispute ID</p><p className="font-mono text-text-primary">{w.id}</p></div>
                              <div className="rounded-lg border border-border p-3"><p className="text-[10px] font-medium uppercase text-text-muted">Amount Difference</p><p className="font-medium text-danger">₹{w.chargedAmount - w.expectedAmount}</p></div>
                              <div className="rounded-lg border border-border p-3"><p className="text-[10px] font-medium uppercase text-text-muted">Charged Amount</p><p className="font-medium text-danger">₹{w.chargedAmount}</p></div>
                              <div className="rounded-lg border border-border p-3"><p className="text-[10px] font-medium uppercase text-text-muted">Expected Amount</p><p className="font-medium text-text-primary">₹{w.expectedAmount}</p></div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Weight Proof Images</h4>
                            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-primary/50 transition-colors cursor-pointer" onClick={() => toast.info("File picker would open here")}>
                              <Upload className="h-8 w-8 text-text-muted mx-auto mb-2" />
                              <p className="text-sm font-medium text-text-secondary">Upload proof images</p>
                              <p className="text-xs text-text-muted mt-1">Drag & drop or click to browse · JPG, PNG up to 5MB</p>
                            </div>
                            <div className="flex gap-2">
                              <div className="relative group w-16 h-16 rounded-lg bg-surface-2 border border-border flex items-center justify-center"><Image className="h-6 w-6 text-text-muted" /><span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full px-1">1</span></div>
                              <div className="relative group w-16 h-16 rounded-lg bg-surface-2 border border-border flex items-center justify-center"><Image className="h-6 w-6 text-text-muted" /><span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full px-1">2</span></div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
