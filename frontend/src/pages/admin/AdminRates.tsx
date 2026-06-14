import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import * as approvalService from "@/services/approvalService";
import { ApiError } from "@/lib/apiClient";
import { usePincodes } from "@/hooks/useApiData";
import { useUnsavedChangesBlocker } from "@/hooks/useUnsavedChangesBlocker";
import { AdminRateCalculatorPanel } from "@/components/admin/AdminRateCalculatorPanel";
import type { PincodeService } from "@/types/logistics";
import {
  formatRateAmount,
  notifyShippingRateCardUpdated,
  parseRateCellInput,
} from "@/lib/shippingRateCardUtils";

const zones = ["A", "B", "C", "D", "E"];
const weights = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

function defaultMatrix() {
  return zones.map((_, zi) => weights.map((_, wi) => 30 + zi * 8 + wi * 15));
}

function matricesEqual(a: number[][], b: number[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function AdminRates() {
  const { data: pincodeList = [] } = usePincodes();
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

  const hasChanges = !matricesEqual(rates, initialRates);

  useUnsavedChangesBlocker(hasChanges, "You have unsaved rate changes. Leave without saving?");

  const pincodeByPin = useMemo(() => {
    const m = new Map<string, PincodeService>();
    for (const p of pincodeList) {
      const pin = String(p.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      if (pin.length === 6) m.set(pin, p as PincodeService);
    }
    return m;
  }, [pincodeList]);

  const resolveRatesMatrix = useCallback(
    async (payment: "COD" | "Prepaid") => {
      if (payment === paymentType) return rates;
      const card = await approvalService.getShippingRateCard(payment);
      return card.rates?.length ? card.rates : defaultMatrix();
    },
    [paymentType, rates]
  );

  const switchPaymentType = (next: "COD" | "Prepaid") => {
    if (next === paymentType) return;
    if (hasChanges) {
      const ok = window.confirm("You have unsaved changes. Switch payment type and discard edits?");
      if (!ok) return;
    }
    setPaymentType(next);
  };

  const startEdit = (zi: number, wi: number) => {
    setEditingCell({ z: zi, w: wi });
    setEditValue(String(rates[zi][wi]));
  };

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const num = parseRateCellInput(editValue);
    if (num == null) {
      toast.error("Enter a valid rate ≥ 0 (decimals allowed)");
      setEditingCell(null);
      return;
    }
    setRates((prev) => {
      const updated = prev.map((row) => [...row]);
      updated[editingCell.z][editingCell.w] = num;
      return updated;
    });
    setEditingCell(null);
  }, [editingCell, editValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  };

  const saveRates = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await approvalService.adminSaveShippingRateCard({
        paymentType,
        zones,
        weights,
        rates,
      });
      setInitialRates(rates.map((row) => [...row]));
      notifyShippingRateCardUpdated();
      toast.success("Rates saved successfully");
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
        Edit zone rates below and click <strong>Save Rates</strong> to publish. Vendor and team member rate
        changes still require approval under{" "}
        <a href="/admin/approvals" className="text-primary underline">
          Pending Approvals
        </a>
        .
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminRateCalculatorPanel pincodeByPin={pincodeByPin} resolveRatesMatrix={resolveRatesMatrix} />

        <div className="rounded-lg bg-card shadow-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-text-primary">Rate Card ({paymentType})</h3>
              <p className="text-xs text-text-muted">Click a cell to edit — changes are local until you save</p>
              {hasChanges && (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Unsaved changes</p>
              )}
              <div className="flex gap-2 pt-1">
                {(["Prepaid", "COD"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchPaymentType(t)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                      paymentType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-surface-2 text-text-secondary border-border hover:bg-surface-2/80"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={!hasChanges || saving || loading}
              onClick={() => void saveRates()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Rates
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-left font-medium text-text-secondary">Zone</th>
                    {weights.map((w) => (
                      <th key={w} className="p-2 text-center font-medium text-text-secondary">
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z, zi) => (
                    <tr key={z} className="border-b border-border last:border-0">
                      <td className="p-2 font-semibold text-primary">Zone {z}</td>
                      {rates[zi]?.map((r, wi) => {
                        const isEditing = editingCell?.z === zi && editingCell?.w === wi;
                        const changed = r !== initialRates[zi]?.[wi];
                        return (
                          <td key={wi} className="p-1 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                className="w-20 h-8 text-center text-sm font-medium rounded-md border-2 border-primary bg-primary-light text-text-primary outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(zi, wi)}
                                className={cn(
                                  "w-full h-8 rounded-md text-sm font-medium transition-colors",
                                  "text-text-primary hover:bg-primary-light hover:text-primary cursor-pointer",
                                  changed && "bg-primary-light text-primary font-bold ring-1 ring-primary/40"
                                )}
                              >
                                ₹{formatRateAmount(r)}
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
