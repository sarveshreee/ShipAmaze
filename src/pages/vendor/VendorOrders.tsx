import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { orders } from "@/data/mockData";

export default function VendorOrders() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Orders" breadcrumb={["Vendor", "Orders"]} />
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Order ID</th>
            <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
            <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
            <th className="p-3 text-left font-medium text-text-secondary">Payment</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Date</th>
          </tr></thead>
          <tbody>
            {orders.slice(0, 20).map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                <td className="p-3 text-text-primary">{o.customer}</td>
                <td className="p-3 text-text-secondary">{o.courier}</td>
                <td className="p-3"><PaymentBadge type={o.payment} /></td>
                <td className="p-3"><StatusBadge status={o.status} /></td>
                <td className="p-3 text-text-muted">{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
