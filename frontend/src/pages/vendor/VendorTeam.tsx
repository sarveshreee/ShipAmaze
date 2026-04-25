import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";

const teamMembers = [
  { name: "Rajesh Kumar", role: "Warehouse Manager", status: "Active" },
  { name: "Sunita Devi", role: "Packer", status: "Active" },
  { name: "Mohan Singh", role: "QC Inspector", status: "Active" },
  { name: "Priti Sharma", role: "Packer", status: "Inactive" },
];

export default function VendorTeam() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Team Management" breadcrumb={["Vendor", "Team"]}
        actions={<Button className="bg-primary text-primary-foreground hover:bg-primary-dark"><Plus className="h-4 w-4 mr-2"/>Add Member</Button>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamMembers.map(m => (
          <div key={m.name} className="rounded-lg bg-card shadow-card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light"><Users2 className="h-5 w-5 text-primary"/></div>
            <div className="flex-1"><p className="font-medium text-text-primary">{m.name}</p><p className="text-xs text-text-muted">{m.role}</p></div>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", m.status === "Active" ? "bg-success-light text-success-dark" : "bg-surface-2 text-text-muted")}>{m.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
