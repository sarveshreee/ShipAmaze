import { PageHeader } from "@/components/PageHeader";
import { supportTickets } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const statusColors: Record<string, string> = {
  Open: "bg-primary-light text-primary-dark",
  "In Progress": "bg-warning-light text-warning-dark",
  Resolved: "bg-success-light text-success-dark",
  Closed: "bg-surface-2 text-text-muted",
};
const priorityColors: Record<string, string> = {
  High: "bg-danger-light text-danger-dark",
  Medium: "bg-warning-light text-warning-dark",
  Low: "bg-success-light text-success-dark",
};

export default function AdminSupport() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Support Tickets" breadcrumb={["Admin", "Support"]} />
      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Ticket ID</th>
            <th className="p-3 text-left font-medium text-text-secondary">Subject</th>
            <th className="p-3 text-left font-medium text-text-secondary">Raised By</th>
            <th className="p-3 text-left font-medium text-text-secondary">Category</th>
            <th className="p-3 text-left font-medium text-text-secondary">Priority</th>
            <th className="p-3 text-left font-medium text-text-secondary">Status</th>
            <th className="p-3 text-left font-medium text-text-secondary">Last Update</th>
            <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
          </tr></thead>
          <tbody>
            {supportTickets.map(t => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                <td className="p-3 font-mono text-xs text-primary">{t.id}</td>
                <td className="p-3 text-text-primary">{t.subject}</td>
                <td className="p-3 text-text-secondary">{t.raisedBy}</td>
                <td className="p-3 text-text-secondary">{t.category}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", priorityColors[t.priority])}>{t.priority}</span></td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[t.status])}>{t.status}</span></td>
                <td className="p-3 text-text-muted">{t.lastUpdate}</td>
                <td className="p-3"><Button variant="outline" size="sm" className="text-xs h-7">View</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
