import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import * as approvalService from "@/services/approvalService";
import { ApiError } from "@/lib/apiClient";

const zones = ["A", "B", "C", "D", "E"];
const weights = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

function defaultMatrix() {
  return zones.map((_, zi) => weights.map((_, wi) => 30 + zi * 8 + wi * 15));
}

export default function AdminRates() {
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [rates, setRates] = useState<number[][]>(defaultMatrix());
  const [initialRates, setInitialRates] = useState<number[][]>(defaultMatrix());
  const [editingCell, setEditingCell] = useState<{ z: number; w: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const card = await approvalService.getShippingRateCard(paymentType);
      const r = card.rates?.length ? card.rates : defaultMatrix();
      setRates(r);
      setInitialRates(r.map((row) => [...row]));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load rate card");
      const d = defaultMatrix();
      setRates(d);
      setInitialRates(d.map((row) => [...row]));
    } finally {
      setLoading(false);
    }
  }, [paymentType]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasChanges = JSON.stringify(rates) !== JSON.stringify(initialRates);

  const startEdit = (zi: number, wi: number) => {
    setEditingCell({ z: zi, w: wi });
    setEditValue(String(rates[zi][wi]));
  };

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num >= 0) {
      setRates((prev) => {
        const updated = prev.map((row) => [...row]);
        updated[editingCell.z][editingCell.w] = num;
        return updated;
      });
    }
    setEditingCell(null);
  }, [editingCell, editValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  };

  const saveRates = async () => {
    setSaving(true);
    try {
      await approvalService.adminSaveShippingRateCard({
        paymentType,
        zones,
        weights,
        rates,
      });
      setInitialRates(rates.map((row) => [...row]));
      toast.success("Rate card saved — live immediately (admin override)");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Rates & Shipping" breadcrumb={["Admin", "Rates"]} />

      <p className="text-sm text-text-muted mb-4">
        Admin changes apply immediately. Vendor and team member rate changes require approval under{" "}
        <a href="/admin/approvals" className="text-primary underline">Pending Approvals</a>.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg bg-card shadow-card p-6">
          <h3 className="font-semibold text-text-primary mb-4">Rate Calculator</h3>
          <div className="space-y-3">
            <div><Label>Origin Pincode</Label><Input placeholder="400001" /></div>
            <div><Label>Destination Pincode</Label><Input placeholder="110001" /></div>
            <div><Label>Weight (kg)</Label><Input placeholder="0.5" type="number" /></div>
            <div>
              <Label>Payment Type</Label>
              <div className="flex gap-2 mt-1">
                {(["Prepaid", "COD"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPaymentType(t)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-sm font-medium border transition-colors",
                      paymentType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-surface-2 text-text-secondary border-transparent"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">Calculate Rates</Button>
          </div>
        </div>

        <div className="rounded-lg bg-card shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-text-primary">Rate Card ({paymentType})</h3>
              <p className="text-xs text-text-muted">Click any cell to edit — admin saves go live instantly</p>
            </div>
            {hasChanges && (
              <Button size="sm" className="text-xs" disabled={saving} onClick={() => void saveRates()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-left font-medium text-text-secondary">Zone</th>
                    {weights.map((w) => (
                      <th key={w} className="p-2 text-center font-medium text-text-secondary">{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z, zi) => (
                    <tr key={z} className="border-b border-border last:border-0">
                      <td className="p-2 font-semibold text-primary">Zone {z}</td>
                      {rates[zi]?.map((r, wi) => {
                        const isEditing = editingCell?.z === zi && editingCell?.w === wi;
                        return (
                          <td key={wi} className="p-1 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                className="w-16 h-8 text-center text-sm font-medium rounded-md border-2 border-primary bg-primary-light text-text-primary outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(zi, wi)}
                                className={cn(
                                  "w-full h-8 rounded-md text-sm font-medium transition-colors",
                                  "text-text-primary hover:bg-primary-light hover:text-primary cursor-pointer",
                                  r !== initialRates[zi]?.[wi] && "bg-primary-light text-primary font-bold"
                                )}
                              >
                                ₹{r}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
