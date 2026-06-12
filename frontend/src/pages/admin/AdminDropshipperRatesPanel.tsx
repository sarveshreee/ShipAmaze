import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import * as approvalService from "@/services/approvalService";
import type { DropshipperCourierRate } from "@/services/approvalService";
import { listDropshippers } from "@/services/dropshipperService";
import { ApiError } from "@/lib/apiClient";

export function AdminDropshipperRatesPanel() {
  const [dropshippers, setDropshippers] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shippingCharge, setShippingCharge] = useState("0");
  const [surfaceRate, setSurfaceRate] = useState("");
  const [airRate, setAirRate] = useState("");
  const [notes, setNotes] = useState("");
  const [courierRates, setCourierRates] = useState<DropshipperCourierRate[]>([]);
  const [historyHint, setHistoryHint] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listDropshippers();
        const list = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
          id: String(r.id ?? r._id ?? ""),
          name: String(r.name ?? r.companyName ?? "Dropshipper"),
          email: String(r.email ?? ""),
        }));
        setDropshippers(list.filter((d) => d.id));
      } catch {
        setDropshippers([]);
      }
    })();
  }, []);

  const loadRates = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await approvalService.getDropshipperShippingRates(userId);
      setShippingCharge(String(res.override.shippingCharge ?? 0));
      setSurfaceRate(res.override.surfaceRate != null ? String(res.override.surfaceRate) : "");
      setAirRate(res.override.airRate != null ? String(res.override.airRate) : "");
      setNotes(res.override.notes ?? "");
      const existing = res.override.courierRates ?? [];
      const merged = res.availableCouriers.map((c) => {
        const hit = existing.find((e) => e.courierName.toLowerCase() === c.name.toLowerCase());
        return {
          courierName: c.name,
          surfaceRate: hit?.surfaceRate ?? c.surfaceRate,
          airRate: hit?.airRate ?? c.airRate,
          enabled: hit?.enabled !== false,
        };
      });
      setCourierRates(merged);
      setHistoryHint(
        res.override.updatedAt ? `Last saved ${new Date(res.override.updatedAt).toLocaleString()} (also logged in shipping approvals)` : null
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load rates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadRates(selectedId);
  }, [selectedId, loadRates]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await approvalService.saveDropshipperShippingRates(selectedId, {
        shippingCharge: Number(shippingCharge) || 0,
        surfaceRate: surfaceRate ? Number(surfaceRate) : undefined,
        airRate: airRate ? Number(airRate) : undefined,
        notes,
        courierRates,
      });
      toast.success("Dropshipper shipping rates saved");
      void loadRates(selectedId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateCourier = (idx: number, patch: Partial<DropshipperCourierRate>) => {
    setCourierRates((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="max-w-md">
        <Label>Select dropshipper</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger><SelectValue placeholder="Choose dropshipper…" /></SelectTrigger>
          <SelectContent>
            {dropshippers.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}{d.email ? ` (${d.email})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedId ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">Select a dropshipper to view and edit courier pricing</div>
      ) : loading ? (
        <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading rates…</div>
      ) : (
        <>
          {historyHint && <p className="text-xs text-text-muted">{historyHint}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>Flat shipping (₹)</Label><Input type="number" value={shippingCharge} onChange={(e) => setShippingCharge(e.target.value)} /></div>
            <div><Label>Default surface (₹)</Label><Input type="number" value={surfaceRate} onChange={(e) => setSurfaceRate(e.target.value)} /></div>
            <div><Label>Default air (₹)</Label><Input type="number" value={airRate} onChange={(e) => setAirRate(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="p-3 text-left">Courier</th>
                  <th className="p-3 text-left">Surface rate (₹)</th>
                  <th className="p-3 text-left">Air rate (₹)</th>
                  <th className="p-3 text-left">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {courierRates.map((r, idx) => (
                  <tr key={r.courierName} className="border-b border-border/60">
                    <td className="p-3 font-medium">{r.courierName}</td>
                    <td className="p-3">
                      <Input type="number" className="h-8" value={r.surfaceRate ?? ""} onChange={(e) => updateCourier(idx, { surfaceRate: e.target.value ? Number(e.target.value) : undefined })} />
                    </td>
                    <td className="p-3">
                      <Input type="number" className="h-8" value={r.airRate ?? ""} onChange={(e) => updateCourier(idx, { airRate: e.target.value ? Number(e.target.value) : undefined })} />
                    </td>
                    <td className="p-3">
                      <input type="checkbox" checked={r.enabled !== false} onChange={(e) => updateCourier(idx, { enabled: e.target.checked })} className="accent-primary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={() => void save()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save rates
          </Button>
        </>
      )}
    </div>
  );
}
