import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as approvalService from "@/services/approvalService";
import { listDropshippers } from "@/services/dropshipperService";
import { ApiError } from "@/lib/apiClient";
import { AdminCourierPricingPanel } from "@/components/admin/AdminCourierPricingPanel";
import type { CourierZoneRow } from "@/lib/courierPricingUtils";

function mapRows(rows: approvalService.CourierZoneRowPayload[]): CourierZoneRow[] {
  return rows.map((r) => ({
    courier: r.courier,
    zone: r.zone,
    rates: [...r.rates],
    codCharge: r.codCharge,
    active: r.active !== false,
  }));
}

export function AdminDropshipperRatesPanel() {
  const [dropshippers, setDropshippers] = useState<Array<{ userId: string; name: string; email?: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [courierZoneRows, setCourierZoneRows] = useState<CourierZoneRow[]>([]);
  const [initialCourierZoneRows, setInitialCourierZoneRows] = useState<CourierZoneRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listDropshippers();
        const list = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
          userId: String(r.userId ?? r.user_id ?? ""),
          name: String(r.name ?? r.companyName ?? "Dropshipper"),
          email: String(r.email ?? ""),
        }));
        setDropshippers(list.filter((d) => d.userId));
      } catch {
        setDropshippers([]);
      }
    })();
  }, []);

  const loadRates = useCallback(async (userId: string, payment: "COD" | "Prepaid") => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await approvalService.getDropshipperShippingRates(userId, payment);
      const zoneRows = mapRows(res.courierZoneRows ?? []);
      setCourierZoneRows(zoneRows);
      setInitialCourierZoneRows(zoneRows.map((r) => ({ ...r, rates: [...r.rates] })));
      setHasOverride(res.hasOverride === true);
      setUpdatedAt(res.updatedAt ?? null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load rates");
      setCourierZoneRows([]);
      setInitialCourierZoneRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) void loadRates(selectedUserId, paymentType);
  }, [selectedUserId, paymentType, loadRates]);

  const save = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await approvalService.saveDropshipperShippingRates(selectedUserId, {
        paymentType,
        courierZoneRows: courierZoneRows.map((r) => ({
          courier: r.courier,
          zone: r.zone,
          rates: [...r.rates],
          codCharge: r.codCharge,
          active: r.active !== false,
        })),
      });
      toast.success("Dropshipper rate override saved");
      void loadRates(selectedUserId, paymentType);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedDropshipper = dropshippers.find((d) => d.userId === selectedUserId);

  return (
    <div className="space-y-4 mt-4">
      <div className="max-w-md">
        <Label>Select dropshipper</Label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose dropshipper…" />
          </SelectTrigger>
          <SelectContent>
            {dropshippers.map((d) => (
              <SelectItem key={d.userId} value={d.userId}>
                {d.name}
                {d.email ? ` (${d.email})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUserId ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
          Select a dropshipper to configure courier-specific rate overrides
        </div>
      ) : (
        <>
          <div className="text-xs text-text-muted space-y-1">
            {selectedDropshipper && (
              <p>
                Editing rates for <span className="font-medium text-text-primary">{selectedDropshipper.name}</span>
                {selectedDropshipper.email ? ` · ${selectedDropshipper.email}` : ""}
              </p>
            )}
            <p>
              {hasOverride
                ? "Showing saved dropshipper overrides — global admin rate card is unchanged."
                : "Showing global rate card as baseline — save to create dropshipper-specific overrides."}
            </p>
            {updatedAt && <p>Last saved {new Date(updatedAt).toLocaleString()}</p>}
          </div>

          <AdminCourierPricingPanel
            matrixOnly
            title="Dropshipper Rate Override"
            subtitle="Per-dropshipper courier matrix — does not modify global admin rates or Courier Rate Master."
            paymentType={paymentType}
            onPaymentTypeChange={setPaymentType}
            courierZoneRows={courierZoneRows}
            onCourierZoneRowsChange={setCourierZoneRows}
            enterpriseRows={[]}
            onEnterpriseRowsChange={() => undefined}
            initialCourierZoneRows={initialCourierZoneRows}
            initialEnterpriseRows={[]}
            loading={loading}
            saving={saving}
            onSave={() => void save()}
          />
        </>
      )}
    </div>
  );
}
