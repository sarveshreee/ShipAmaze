import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Save, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as courierRateService from "@/services/courierRateService";
import type { CourierRateMaster, CourierWeightSlab } from "@/services/courierRateService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  courierNames: string[];
};

export function AdminCourierRatesPanel({ courierNames }: Props) {
  const [items, setItems] = useState<CourierRateMaster[]>([]);
  const [available, setAvailable] = useState<courierRateService.AvailableCourier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourierRateMaster | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCourierName, setNewCourierName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ratesRes, availRes] = await Promise.all([
        courierRateService.listCourierRateMasters(),
        courierRateService.listAvailableCouriers(),
      ]);
      setItems(ratesRes.items ?? []);
      setAvailable(availRes.items ?? []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load courier rates");
      setItems([]);
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => {
    if (draft) return draft;
    if (!selectedId) return null;
    return items.find((i) => i.id === selectedId) ?? null;
  }, [draft, selectedId, items]);

  const unconfiguredNames = useMemo(() => {
    const configured = new Set(items.map((i) => i.courierName.toLowerCase()));
    const names = new Set<string>();
    for (const c of available) names.add(c.name);
    for (const n of courierNames) names.add(n);
    return [...names].filter((n) => !configured.has(n.toLowerCase())).sort();
  }, [available, courierNames, items]);

  const startEdit = (row: CourierRateMaster) => {
    setSelectedId(row.id);
    setDraft({ ...row, weightSlabs: row.weightSlabs.map((s) => ({ ...s })) });
  };

  const updateSlab = (idx: number, patch: Partial<CourierWeightSlab>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      weightSlabs: draft.weightSlabs.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.courierName.trim()) {
      toast.error("Courier name is required");
      return;
    }
    for (const slab of draft.weightSlabs) {
      if (!(slab.weightKg > 0)) {
        toast.error("Each weight slab must have weight > 0");
        return;
      }
      if (slab.prepaidRate < 0 || slab.codRate < 0) {
        toast.error("Rates must be ≥ 0");
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await courierRateService.updateCourierRateMaster(draft.id, {
        courierName: draft.courierName.trim(),
        carrierId: draft.carrierId.trim(),
        active: draft.active,
        weightSlabs: draft.weightSlabs,
        notes: draft.notes,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setDraft(updated);
      toast.success(`Rates saved for ${updated.courierName}`);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addCourier = async () => {
    const name = newCourierName.trim();
    if (!name) {
      toast.error("Select or enter a courier name");
      return;
    }
    setAdding(true);
    try {
      const created = await courierRateService.createCourierRateMaster({
        courierName: name,
        weightSlabs: courierRateService.DEFAULT_WEIGHT_SLABS.map((s) => ({ ...s })),
      });
      setItems((prev) => [...prev, created].sort((a, b) => a.courierName.localeCompare(b.courierName)));
      setNewCourierName("");
      startEdit(created);
      toast.success(`Rate master created for ${name}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add courier");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete rate master for ${name}?`)) return;
    try {
      await courierRateService.deleteCourierRateMaster(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(null);
      }
      toast.success("Rate master deleted");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted py-12">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading courier rates…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-card shadow-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Courier rate master
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Configure weight-slab pricing per courier partner. Rates are stored per courier — not a single flat
              dropshipper rate.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-6 p-4 rounded-lg border border-dashed border-border bg-surface-2/50">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Add courier</Label>
            {unconfiguredNames.length > 0 ? (
              <Select value={newCourierName} onValueChange={setNewCourierName}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Select courier…" />
                </SelectTrigger>
                <SelectContent>
                  {unconfiguredNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="mt-1 h-9 text-sm"
                value={newCourierName}
                onChange={(e) => setNewCourierName(e.target.value)}
                placeholder="Enter courier name (e.g. Delhivery)"
              />
            )}
            {unconfiguredNames.length > 0 && (
              <p className="text-[10px] text-text-muted mt-1">
                Choose a partner to create a new rate master.
              </p>
            )}
          </div>
          <Button size="sm" className="gap-1.5" disabled={adding || !newCourierName} onClick={() => void addCourier()}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add courier rates
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
          <div className="space-y-1">
            {items.length === 0 ? (
              <p className="text-sm text-text-muted p-3">No courier rate masters yet.</p>
            ) : (
              items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => startEdit(row)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors border",
                    selected?.id === row.id
                      ? "border-primary bg-primary-light/30 text-text-primary"
                      : "border-transparent hover:bg-surface-2 text-text-secondary"
                  )}
                >
                  <span className="font-medium block truncate">{row.courierName}</span>
                  <span className="text-[10px] text-text-muted">
                    {row.weightSlabs.length} slabs · {row.active ? "Active" : "Inactive"}
                  </span>
                </button>
              ))
            )}
          </div>

          {selected ? (
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-text-primary">{selected.courierName}</h4>
                  {!selected.active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft?.active ?? selected.active}
                    onCheckedChange={(v) => draft && setDraft({ ...draft, active: v === true })}
                  />
                  <span className="text-xs text-text-muted">Active</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => void remove(selected.id, selected.courierName)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Velocity carrier ID (optional)</Label>
                <Input
                  className="mt-1 h-8 text-sm max-w-xs"
                  value={draft?.carrierId ?? ""}
                  placeholder="Maps to Velocity partner"
                  onChange={(e) => draft && setDraft({ ...draft, carrierId: e.target.value })}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-muted">
                      <th className="py-2 pr-4 font-medium">Weight</th>
                      <th className="py-2 pr-4 font-medium">Prepaid (₹)</th>
                      <th className="py-2 font-medium">COD (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(draft?.weightSlabs ?? selected.weightSlabs).map((slab, idx) => (
                      <tr key={slab.weightKg} className="border-b border-border/60">
                        <td className="py-2 pr-4 font-medium text-text-primary">{slab.weightLabel}</td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24 text-sm"
                            value={slab.prepaidRate}
                            onChange={(e) => updateSlab(idx, { prepaidRate: Number(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="py-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24 text-sm"
                            value={slab.codRate}
                            onChange={(e) => updateSlab(idx, { codRate: Number(e.target.value) || 0 })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button size="sm" className="gap-1.5" disabled={saving || !draft} onClick={() => void save()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save rates
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-text-muted">
              Select a courier to edit weight-slab rates, or add a new courier above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
