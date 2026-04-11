import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { OrderCardList } from "@/components/OrderCardList";
import { orders } from "@/data/mockData";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { printShippingLabel, printBulkLabels } from "@/components/ShippingLabel";
import { useState } from "react";
import { toast } from "sonner";

export default function DropshipperOrders() {
  const isMobile = useIsMobile();
  const data = orders.slice(0, 25);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkPrint = () => {
    const selectedOrders = data.filter(o => selected.has(o.id));
    if (selectedOrders.length === 0) {
      toast.error("Select at least one order to print labels");
      return;
    }
    printBulkLabels(selectedOrders);
    toast.success(`Printing ${selectedOrders.length} label(s)`);
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Orders" breadcrumb={["Dropshipper", "Orders"]}
        actions={
          <Button variant="outline" onClick={handleBulkPrint} className="gap-2" disabled={selected.size === 0}>
            <Printer className="h-4 w-4" /> Print Labels {selected.size > 0 && `(${selected.size})`}
          </Button>
        }
      />

      {isMobile ? (
        <OrderCardList orders={data} />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left w-10">
                <input type="checkbox" className="rounded border-border accent-primary"
                  checked={selected.size === data.length && data.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(data.map(o => o.id)) : new Set())}
                />
              </th>
              <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
              <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
              <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
              <th className="p-3 text-left font-medium text-text-secondary">Status</th>
              <th className="p-3 text-left font-medium text-text-secondary">Amount</th>
              <th className="p-3 text-left font-medium text-text-secondary">Date</th>
              <th className="p-3 text-left font-medium text-text-secondary">Label</th>
            </tr></thead>
            <tbody>{data.map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3">
                  <input type="checkbox" className="rounded border-border accent-primary"
                    checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
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
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
