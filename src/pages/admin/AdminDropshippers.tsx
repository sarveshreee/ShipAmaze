import { PageHeader } from "@/components/PageHeader";
import { dropshippers } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function AdminDropshippers() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dropshipper Management" breadcrumb={["Admin", "Dropshippers"]} />
      <div className="mb-4"><div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"/><Input placeholder="Search dropshippers..." className="pl-9"/></div></div>
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Name</th>
            <th className="p-3 text-left font-medium text-text-secondary">Email</th>
            <th className="p-3 text-left font-medium text-text-secondary">Phone</th>
            <th className="p-3 text-left font-medium text-text-secondary">Total Orders</th>
            <th className="p-3 text-left font-medium text-text-secondary">Active</th>
            <th className="p-3 text-left font-medium text-text-secondary">Wallet</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {dropshippers.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-medium text-text-primary">{d.name}</td>
                <td className="p-3 text-text-secondary">{d.email}</td>
                <td className="p-3 text-text-secondary">{d.phone}</td>
                <td className="p-3 text-text-primary font-medium">{d.totalOrders}</td>
                <td className="p-3 text-text-secondary">{d.activeOrders}</td>
                <td className="p-3 text-success font-medium">₹{d.wallet.toLocaleString()}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", d.status === "Active" ? "bg-success-light text-success-dark" : "bg-surface-2 text-text-muted")}>{d.status}</span></td>
                <td className="p-3"><Button variant="outline" size="sm" className="text-xs h-7">View</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
