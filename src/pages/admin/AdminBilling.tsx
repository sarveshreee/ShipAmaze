import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useInvoices, useCodRemittances } from "@/hooks/useSupabaseData";
import { FileText, Download, IndianRupee, Clock, CheckCircle2, AlertTriangle, Filter } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const invoiceStatusColors: Record<string, string> = {
  Paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Unpaid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const codStatusColors: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Settled: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'On Hold': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const billingPeriods = ["All Periods", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"];
const statusFilters = ["All", "Paid", "Unpaid", "Overdue"];

export default function AdminBilling() {
  const [tab, setTab] = useState<'invoices' | 'cod'>('invoices');
  const [periodFilter, setPeriodFilter] = useState("All Periods");
  const [statusFilter, setStatusFilter] = useState("All");
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: codRemittances = [] } = useCodRemittances();

  const totalCOD = codRemittances.reduce((s, c) => s + c.codAmount, 0);
  const pendingCOD = codRemittances.filter(c => c.status === 'Pending' || c.status === 'Processing').reduce((s, c) => s + c.netPayable, 0);

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter !== "All" && inv.status !== statusFilter) return false;
    if (periodFilter !== "All Periods" && !inv.period.includes(periodFilter)) return false;
    return true;
  });

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading billing data...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Billing & Invoices" breadcrumb={["Admin", "Billing"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={FileText} label="Total Invoices" value={String(invoices.length)} color="primary" />
        <KPICard icon={IndianRupee} label="Total COD Collected" value={`₹${(totalCOD / 1000).toFixed(1)}K`} color="success" />
        <KPICard icon={Clock} label="Pending COD" value={`₹${(pendingCOD / 1000).toFixed(1)}K`} color="warning" />
        <KPICard icon={AlertTriangle} label="Overdue Invoices" value={String(invoices.filter(i => i.status === 'Overdue').length)} color="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 border-b border-border">
          {(['invoices', 'cod'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
              )}>{t === 'cod' ? 'COD Remittance' : 'Invoices'}</button>
          ))}
        </div>
        {tab === 'invoices' && (
          <div className="ml-auto flex items-center gap-2">
            <Filter className="h-4 w-4 text-text-muted" />
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-text-primary">
              {billingPeriods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-text-primary">
              {statusFilters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {tab === 'invoices' && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Invoice ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
              <th className="p-3 text-left font-medium text-text-secondary">Period</th>
              <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Download</th>
            </tr></thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted">No invoices match the selected filters</td></tr>
              ) : filteredInvoices.map(inv => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-mono text-xs text-primary">{inv.id}</td>
                  <td className="p-3 text-text-muted">{inv.date}</td>
                  <td className="p-3 text-text-secondary">{inv.period}</td>
                  <td className="p-3 text-right font-medium text-text-primary">₹{inv.total.toLocaleString()}</td>
                  <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", invoiceStatusColors[inv.status])}>{inv.status}</span></td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast.success(`Invoice ${inv.id} downloaded`)}><Download className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'cod' && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Dropshipper</th>
              <th className="p-3 text-right font-medium text-text-secondary">Orders</th>
              <th className="p-3 text-right font-medium text-text-secondary">COD Amount</th>
              <th className="p-3 text-right font-medium text-text-secondary">Deductions</th>
              <th className="p-3 text-right font-medium text-text-secondary">Net Payable</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Settle Date</th>
              <th className="p-3 text-left font-medium text-text-secondary">UTR</th>
              <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
            </tr></thead>
            <tbody>
              {codRemittances.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-mono text-xs text-primary">{c.id}</td>
                  <td className="p-3 text-text-primary">{c.dropshipper}</td>
                  <td className="p-3 text-right text-text-primary">{c.ordersCount}</td>
                  <td className="p-3 text-right font-medium text-text-primary">₹{c.codAmount.toLocaleString()}</td>
                  <td className="p-3 text-right text-danger">-₹{c.deductions.toLocaleString()}</td>
                  <td className="p-3 text-right font-medium text-success">₹{c.netPayable.toLocaleString()}</td>
                  <td className="p-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", codStatusColors[c.status])}>{c.status}</span></td>
                  <td className="p-3 text-text-muted">{c.settleDate}</td>
                  <td className="p-3 font-mono text-xs text-text-muted">{c.utr || '—'}</td>
                  <td className="p-3">
                    {c.status === 'Pending' && <Button size="sm" className="text-xs h-7 bg-primary text-primary-foreground" onClick={() => toast.success(`COD ${c.id} settled`)}>Settle</Button>}
                    {c.status !== 'Pending' && <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toast.info(`Viewing ${c.id}`)}>View</Button>}
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
