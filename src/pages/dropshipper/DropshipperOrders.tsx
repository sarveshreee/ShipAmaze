import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { OrderCardList } from "@/components/OrderCardList";
import { OrderCardSkeleton, TableSkeleton } from "@/components/SkeletonLoaders";
import { EmptyState } from "@/components/EmptyState";
import { BulkActionBar } from "@/components/BulkActionBar";
import { useOrders } from "@/hooks/useSupabaseData";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Printer, Package, RefreshCw, FileText } from "lucide-react";
import { printShippingLabel, printBulkLabels } from "@/components/ShippingLabel";
import { downloadCSV } from "@/lib/exportUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DropshipperOrders() {
  const isMobile = useIsMobile();
  const { data: allOrders = [], isLoading: loading } = useOrders();
  const data = allOrders.slice(0, 25);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleBulkPrint = () => {
    const sel = data.filter(o => selected.has(o.id));
    if (sel.length === 0) { toast.error("Select at least one order"); return; }
    printBulkLabels(sel);
    toast.success(`Printing ${sel.length} label(s)`);
  };

  const handleExport = () => {
    const sel = selected.size > 0 ? data.filter(o => selected.has(o.id)) : data;
    downloadCSV("orders_export", ["ID","Customer","Status","Payment","Amount","Date","AWB"], sel.map(o => [o.id, o.customer, o.status, o.payment, o.amount, o.date, o.awb]));
    toast.success(`Exported ${sel.length} orders`);
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Orders" breadcrumb={["Dropshipper", "Orders"]} />

      {isMobile ? (
        loading ? <OrderCardSkeleton /> : (
          data.length === 0 ? <EmptyState icon={Package} title="No orders yet" description="Create your first order to get started" actionLabel="Create Order" onAction={() => {}} /> :
          <OrderCardList orders={data} />
        )
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left w-10">
                <input type="checkbox" className="rounded border-border accent-primary"
                  checked={selected.size === data.length && data.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(data.map(o => o.id)) : new Set())} />
              </th>
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Amount</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
              <th className="p-3 text-left font-medium text-text-secondary">Label</th>
            </tr></thead>
            <tbody>
              {loading ? <TableSkeleton rows={8} columns={8} /> : data.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={Package} title="No orders yet" description="Create your first order to get started" /></td></tr>
              ) : data.map(o => (
                <tr key={o.id} className={cn("border-b border-border last:border-0 hover:bg-surface-2/30", selected.has(o.id) && "bg-primary-light/30")}>
                  <td className="p-3"><input type="checkbox" className="rounded border-border accent-primary" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                  <td className="p-3 text-text-primary">{o.customer}</td>
                  <td className="p-3"><PaymentBadge type={o.payment}/></td>
                  <td className="p-3"><StatusBadge status={o.status}/></td>
                  <td className="p-3 font-medium text-text-primary">₹{o.amount}</td>
                  <td className="p-3 text-text-muted">{o.date}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { printShippingLabel(o); toast.success("Printing label..."); }}>
                      <Printer className="h-4 w-4 text-primary" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleBulkPrint}>
          <Printer className="h-3.5 w-3.5" /> Print Labels
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { toast.success(`Status updated for ${selected.size} order(s)`); setSelected(new Set()); }}>
          <RefreshCw className="h-3.5 w-3.5" /> Update Status
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleExport}>
          <FileText className="h-3.5 w-3.5" /> Export
        </Button>
      </BulkActionBar>
    </div>
  );
}
