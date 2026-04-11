import { PageHeader } from "@/components/PageHeader";
import { vendors } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Plus, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminVendors() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Vendor Management" breadcrumb={["Admin", "Vendors"]}
        actions={<Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => toast.info("Add warehouse form coming soon")}><Plus className="h-4 w-4 mr-2"/>Add Warehouse</Button>}
      />
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Warehouse</th>
            <th className="p-3 text-left font-medium text-text-secondary">City</th>
            <th className="p-3 text-left font-medium text-text-secondary">PIN</th>
            <th className="p-3 text-left font-medium text-text-secondary">Assigned</th>
            <th className="p-3 text-left font-medium text-text-secondary">Orders Today</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {vendors.map(v => (
              <tr key={v.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 flex items-center gap-2"><Warehouse className="h-4 w-4 text-primary"/><span className="font-medium text-text-primary">{v.name}</span></td>
                <td className="p-3 text-text-secondary">{v.city}</td>
                <td className="p-3 font-mono text-xs text-text-secondary">{v.pin}</td>
                <td className="p-3 text-text-primary">{v.assignedVendors}</td>
                <td className="p-3 font-medium text-text-primary">{v.ordersToday}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", v.status === "Active" ? "bg-success-light text-success-dark" : "bg-surface-2 text-text-muted")}>{v.status}</span></td>
                <td className="p-3"><Button variant="outline" size="sm" className="text-xs h-7" onClick={() => toast.info(`Managing ${v.name}`)}>Manage</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
