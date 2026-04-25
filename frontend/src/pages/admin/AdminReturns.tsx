import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { useReturnOrders } from "@/hooks/useApiData";
import { Undo2, Package, Truck, CheckCircle2, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import * as returnService from "@/services/returnService";

const returnStatusColors: Record<string, string> = {
  'Return Requested': 'bg-warning-light text-warning-dark',
  'Pickup Scheduled': 'bg-secondary-light text-secondary-dark',
  'In Transit': 'bg-primary-light text-primary-dark',
  'Received': 'bg-success-light text-success-dark',
  'Refund Processed': 'bg-success-light text-success-dark',
  'Cancelled': 'bg-surface-2 text-text-muted',
};

export default function AdminReturns() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const tabs = ['all', 'Return Requested', 'Pickup Scheduled', 'In Transit', 'Received', 'Refund Processed'];
  const { data: returnOrders = [], isLoading, refetch } = useReturnOrders();

  const filtered = returnOrders.filter(r => {
    if (tab !== 'all' && r.status !== tab) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return [r.id, r.originalOrderId, r.reason, r.courier, r.customer, r.status, r.date, String(r.refundAmount)]
        .some(val => val != null && String(val).toLowerCase().includes(q));
    }
    return true;
  });

  const handleExport = () => {
    downloadCSV("returns_export",
      ["Return ID", "Original Order", "Customer", "Reason", "Courier", "AWB", "Refund", "Status", "Date"],
      filtered.map(r => [r.id, r.originalOrderId, r.customer, r.reason, r.courier, r.awb, r.refundAmount, r.status, r.date])
    );
    toast.success(`Exported ${filtered.length} returns`);
  };

  const handleStatusUpdate = async (returnId: string, newStatus: string) => {
    try {
      await returnService.updateReturn(returnId, { status: newStatus });
      toast.success(`Return ${returnId} → ${newStatus}`);
      refetch();
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Update failed"}`);
    }
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading returns...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Returns & RTO" breadcrumb={["Admin", "Returns"]} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Undo2} label="Total Returns" value={String(returnOrders.length)} color="primary" />
        <KPICard icon={Package} label="Pending Pickup" value={String(returnOrders.filter(r => r.status === 'Return Requested' || r.status === 'Pickup Scheduled').length)} color="warning" />
        <KPICard icon={Truck} label="In Transit" value={String(returnOrders.filter(r => r.status === 'In Transit').length)} color="secondary" />
        <KPICard icon={CheckCircle2} label="Completed" value={String(returnOrders.filter(r => r.status === 'Received' || r.status === 'Refund Processed').length)} color="success" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              )}>{t === 'all' ? 'All' : t}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input placeholder="Search returns..." className="pl-9 w-56" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Undo2} title="No returns found" description="No return orders match the current filter" actionLabel="Show All" onAction={() => { setTab('all'); setSearch(''); }} />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Return ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Original Order</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">Reason</th>
              <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
              <th className="p-3 text-left font-medium text-text-secondary">AWB</th>
              <th className="p-3 text-right font-medium text-text-secondary">Refund</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
              <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-mono text-xs text-primary">{r.id}</td>
                  <td className="p-3 font-mono text-xs text-text-primary">{r.originalOrderId}</td>
                  <td className="p-3 text-text-primary">{r.customer}</td>
                  <td className="p-3"><span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">{r.reason}</span></td>
                  <td className="p-3 text-text-secondary">{r.courier}</td>
                  <td className="p-3 font-mono text-xs text-text-muted">{r.awb}</td>
                  <td className="p-3 text-right font-medium text-text-primary">₹{r.refundAmount.toLocaleString()}</td>
                  <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", returnStatusColors[r.status])}>{r.status}</span></td>
                  <td className="p-3 text-text-muted">{r.date}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {r.status === 'Return Requested' && (
                        <Button size="sm" className="text-xs h-7 bg-primary text-primary-foreground" onClick={() => handleStatusUpdate(r.id, 'Pickup Scheduled')}>Schedule Pickup</Button>
                      )}
                      {r.status === 'Received' && (
                        <Button size="sm" className="text-xs h-7 bg-success text-primary-foreground" onClick={() => handleStatusUpdate(r.id, 'Refund Processed')}>Process Refund</Button>
                      )}
                    </div>
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
