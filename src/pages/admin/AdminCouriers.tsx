import { PageHeader } from "@/components/PageHeader";
import { courierList } from "@/data/mockData";
import { Truck, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminCouriers() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Courier Management" breadcrumb={["Admin", "Couriers"]} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {courierList.map(c => (
          <div key={c.name} className="rounded-lg bg-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light"><Truck className="h-5 w-5 text-primary" /></div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">{c.name}</h3>
                <span className={cn("text-xs font-medium", c.active ? "text-success" : "text-text-muted")}>{c.active ? "Active" : "Inactive"}</span>
              </div>
              <span className="rounded-full bg-tertiary-light px-2 py-0.5 text-xs font-medium text-tertiary-dark">P{c.priority}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-success-light p-2"><p className="text-sm font-bold text-success-dark">{c.deliveryRate}%</p><p className="text-[10px] text-success-dark/80">Delivery</p></div>
              <div className="rounded-md bg-warning-light p-2"><p className="text-sm font-bold text-warning-dark">{c.ndrRate}%</p><p className="text-[10px] text-warning-dark/80">NDR</p></div>
              <div className="rounded-md bg-danger-light p-2"><p className="text-sm font-bold text-danger-dark">{c.rtoRate}%</p><p className="text-[10px] text-danger-dark/80">RTO</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-card shadow-card p-6">
        <h3 className="font-semibold text-text-primary mb-4">Priority Order</h3>
        <div className="space-y-2">
          {courierList.filter(c => c.active).map(c => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-surface-2/50 transition-colors cursor-move">
              <GripVertical className="h-4 w-4 text-text-muted" />
              <Truck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-text-primary">{c.name}</span>
              <span className="ml-auto text-xs text-text-muted">Priority {c.priority}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
