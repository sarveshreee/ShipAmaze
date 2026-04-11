import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useCouriers } from "@/hooks/useSupabaseData";
import { Truck, GripVertical, Plus, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PriorityRule {
  id: string;
  condition: string;
  courier: string;
}

const defaultRules: PriorityRule[] = [
  { id: "1", condition: "Weight > 5 kg", courier: "Delhivery" },
  { id: "2", condition: "Zone = Metro", courier: "Blue Dart" },
  { id: "3", condition: "Payment = COD", courier: "DTDC" },
];

export default function AdminCouriers() {
  const [rules, setRules] = useState<PriorityRule[]>(defaultRules);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const { data: courierList = [], isLoading } = useCouriers();

  const addRule = () => { setRules([...rules, { id: Date.now().toString(), condition: "", courier: "" }]); };
  const removeRule = (id: string) => { setRules(rules.filter(r => r.id !== id)); toast.success("Rule removed"); };
  const updateRule = (id: string, field: "condition" | "courier", value: string) => { setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r)); };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...rules];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setRules(updated);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading couriers...</div>;

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
                <button onClick={() => toast.success(`${c.name} ${c.active ? 'disabled' : 'enabled'}`)}
                  className={cn("text-xs font-medium cursor-pointer hover:underline", c.active ? "text-success" : "text-text-muted")}>{c.active ? "Active" : "Inactive"}</button>
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

      <div className="rounded-lg bg-card shadow-card p-6 mb-6">
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

      <div className="rounded-lg bg-card shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-text-primary">Priority Rules</h3>
            <p className="text-xs text-text-muted mt-0.5">Drag to reorder · Rules are evaluated top-to-bottom</p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => { addRule(); toast.info("New rule added"); }}>
            <Plus className="h-3.5 w-3.5" /> Add Rule
          </Button>
        </div>
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={rule.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd}
              className={cn("flex items-center gap-3 rounded-lg border border-border p-3 transition-all", dragIdx === idx ? "opacity-50 bg-primary-light border-primary/30" : "hover:bg-surface-2/50", "cursor-grab active:cursor-grabbing")}>
              <GripVertical className="h-4 w-4 text-text-muted shrink-0" />
              <span className="text-xs font-medium text-text-muted shrink-0 w-5">{idx + 1}.</span>
              <span className="text-xs text-text-secondary shrink-0">If</span>
              <Input value={rule.condition} onChange={e => updateRule(rule.id, "condition", e.target.value)} placeholder="e.g. Weight > 5 kg" className="h-8 text-xs flex-1 min-w-[120px]" />
              <ArrowRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
              <span className="text-xs text-text-secondary shrink-0">prefer</span>
              <Input value={rule.courier} onChange={e => updateRule(rule.id, "courier", e.target.value)} placeholder="e.g. Delhivery" className="h-8 text-xs w-[130px]" />
              <button onClick={() => removeRule(rule.id)} className="text-text-muted hover:text-danger transition-colors shrink-0"><X className="h-4 w-4" /></button>
            </div>
          ))}
          {rules.length === 0 && <div className="text-center py-8 text-text-muted text-sm">No priority rules configured. Click "Add Rule" to create one.</div>}
        </div>
        {rules.length > 0 && <Button variant="outline" className="mt-4 text-xs" onClick={() => toast.success("Priority rules saved")}>Save Rules</Button>}
      </div>
    </div>
  );
}
