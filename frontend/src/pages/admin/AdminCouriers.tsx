import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useCouriers } from "@/hooks/useApiData";
import { Truck, GripVertical, Plus, X, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import * as courierPriorityService from "@/services/courierPriorityService";
import type { CourierPriorityRule, CourierPriorityRuleType } from "@/services/courierPriorityService";
import { ApiError } from "@/lib/apiClient";

const RULE_TYPES: { value: CourierPriorityRuleType; label: string; placeholder: string }[] = [
  { value: "sku", label: "SKU wise", placeholder: "e.g. SKU-ABC-123" },
  { value: "weight", label: "Weight wise", placeholder: "e.g. 0-1, 1-5, >5 (kg)" },
  { value: "productName", label: "Product name wise", placeholder: "e.g. Cotton T-Shirt" },
  { value: "sellerId", label: "Seller ID wise", placeholder: "User / owner id" },
  { value: "vendorId", label: "Vendor ID wise", placeholder: "Vendor document id" },
];

export default function AdminCouriers() {
  const [rules, setRules] = useState<CourierPriorityRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: courierList = [], isLoading } = useCouriers();

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await courierPriorityService.listCourierPriorityRules();
      setRules(r.items ?? []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load priority rules");
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const addRule = async () => {
    try {
      const created = await courierPriorityService.createCourierPriorityRule({
        ruleType: "sku",
        matchValue: "",
        priorities: [{ courierName: courierList[0]?.name ?? "Delhivery", rank: 1 }],
        enabled: true,
      });
      setRules((prev) => [...prev, created]);
      toast.info("New rule added — fill match value and save");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add rule");
    }
  };

  const saveRule = async (rule: CourierPriorityRule) => {
    if (!rule.matchValue.trim()) {
      toast.error("Match value is required");
      return;
    }
    if (!rule.priorities.length) {
      toast.error("Add at least one courier priority");
      return;
    }
    setSaving(true);
    try {
      const updated = await courierPriorityService.updateCourierPriorityRule(rule.id, rule);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      toast.success("Rule saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id: string) => {
    try {
      await courierPriorityService.deleteCourierPriorityRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const updateRuleLocal = (id: string, patch: Partial<CourierPriorityRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addPriorityRow = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const nextRank = (r.priorities[r.priorities.length - 1]?.rank ?? 0) + 1;
        return {
          ...r,
          priorities: [
            ...r.priorities,
            { courierName: courierList[0]?.name ?? "", rank: nextRank },
          ],
        };
      })
    );
  };

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
  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await courierPriorityService.reorderCourierPriorityRules(rules.map((r) => r.id));
    } catch {
      toast.error("Could not save rule order");
      void loadRules();
    }
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading couriers...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Courier Management" breadcrumb={["Admin", "Couriers"]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {courierList.map((c) => (
          <div key={c.name} className="rounded-lg bg-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">{c.name}</h3>
                <span className={cn("text-xs font-medium", c.active ? "text-success" : "text-text-muted")}>
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
              <span className="rounded-full bg-tertiary-light px-2 py-0.5 text-xs font-medium text-tertiary-dark">
                P{c.priority}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-card shadow-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-text-primary">Courier priority rules</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Evaluated top-to-bottom during auto courier assignment. Drag rules to reorder.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary-dark"
            onClick={() => void addRule()}
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </Button>
        </div>

        {rulesLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule, idx) => {
              const typeMeta = RULE_TYPES.find((t) => t.value === rule.ruleType) ?? RULE_TYPES[0];
              return (
                <div
                  key={rule.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={() => void handleDragEnd()}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-3",
                    dragIdx === idx ? "opacity-60 bg-primary-light/30" : "bg-card",
                    "cursor-grab active:cursor-grabbing"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <GripVertical className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-xs font-medium text-text-muted w-6">{idx + 1}.</span>
                    <Select
                      value={rule.ruleType}
                      onValueChange={(v) =>
                        updateRuleLocal(rule.id, { ruleType: v as CourierPriorityRuleType })
                      }
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs flex-1 min-w-[140px]"
                      value={rule.matchValue}
                      placeholder={typeMeta.placeholder}
                      onChange={(e) => updateRuleLocal(rule.id, { matchValue: e.target.value })}
                    />
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => updateRuleLocal(rule.id, { enabled: v === true })}
                      />
                      <span className="text-xs text-text-muted">Enabled</span>
                      <button
                        type="button"
                        onClick={() => void removeRule(rule.id)}
                        className="text-text-muted hover:text-danger p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pl-8">
                    <p className="text-xs font-medium text-text-muted">Courier priority (1 = first choice)</p>
                    {rule.priorities.map((p, pi) => (
                      <div key={pi} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs w-5 text-text-muted">{p.rank}.</span>
                        <Select
                          value={p.courierName}
                          onValueChange={(v) => {
                            const priorities = rule.priorities.map((row, j) =>
                              j === pi ? { ...row, courierName: v } : row
                            );
                            updateRuleLocal(rule.id, { priorities });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-xs">
                            <SelectValue placeholder="Courier" />
                          </SelectTrigger>
                          <SelectContent>
                            {courierList.map((c) => (
                              <SelectItem key={c.name} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <ArrowRight className="h-3 w-3 text-text-muted hidden sm:block" />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addPriorityRow(rule.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add courier
                    </Button>
                  </div>

                  <div className="pl-8">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={saving}
                      onClick={() => void saveRule(rule)}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Save rule
                    </Button>
                  </div>
                </div>
              );
            })}
            {rules.length === 0 && (
              <div className="text-center py-10 text-text-muted text-sm">
                No priority rules yet. Add a rule to configure SKU, weight, product, seller, or vendor based routing.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
