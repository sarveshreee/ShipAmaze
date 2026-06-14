import { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as approvalService from "@/services/approvalService";
import * as adminWorkflowService from "@/services/adminWorkflowService";
import { ApiError } from "@/lib/apiClient";
import {
  assertDropshipperUserId,
  isDropshipperUserId,
  normalizeDropshipperUserId,
} from "@/lib/dropshipperUserId";
import { AdminCourierPricingPanel } from "@/components/admin/AdminCourierPricingPanel";
import type { CourierZoneRow } from "@/lib/courierPricingUtils";

type DropshipperOption = {
  userId: string;
  name: string;
  email: string;
};

function mapRows(rows: approvalService.CourierZoneRowPayload[]): CourierZoneRow[] {
  return rows.map((r) => ({
    courier: r.courier,
    zone: r.zone,
    rates: [...r.rates],
    codCharge: r.codCharge,
    active: r.active !== false,
  }));
}

function formatDropshipperLabel(d: DropshipperOption): string {
  return d.email ? `${d.name} (${d.email})` : d.name;
}

export function AdminDropshipperRatesPanel() {
  const [dropshippers, setDropshippers] = useState<DropshipperOption[]>([]);
  const [dropshippersLoading, setDropshippersLoading] = useState(true);
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
      setDropshippersLoading(true);
      try {
        const res = await adminWorkflowService.adminListDropshippers({ page: "1", limit: "500" });
        const list = (res.items ?? [])
          .map((row) => {
            const userId = normalizeDropshipperUserId(row.userId);
            return {
              userId,
              name: row.name?.trim() || row.companyName?.trim() || "Dropshipper",
              email: row.email?.trim() ?? "",
            };
          })
          .filter((d) => isDropshipperUserId(d.userId));
        setDropshippers(list);
      } catch (e) {
        setDropshippers([]);
        toast.error(e instanceof ApiError ? e.message : "Failed to load dropshippers");
      } finally {
        setDropshippersLoading(false);
      }
    })();
  }, []);

  const loadRates = useCallback(async (userId: string, payment: "COD" | "Prepaid") => {
    let canonicalUserId: string;
    try {
      canonicalUserId = assertDropshipperUserId(userId);
    } catch {
      toast.error("Invalid dropshipper selection — choose a valid user");
      return;
    }
    setLoading(true);
    try {
      const res = await approvalService.getDropshipperShippingRates(canonicalUserId, payment);
      const zoneRows = mapRows(res.courierZoneRows ?? []);
      setCourierZoneRows(zoneRows);
      setInitialCourierZoneRows(zoneRows.map((r) => ({ ...r, rates: [...r.rates] })));
      setHasOverride(res.hasOverride === true);
      setUpdatedAt(res.updatedAt ?? null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load rates");
      setCourierZoneRows([]);
      setInitialCourierZoneRows([]);
      setHasOverride(false);
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDropshipperUserId(selectedUserId)) {
      void loadRates(selectedUserId, paymentType);
    }
  }, [selectedUserId, paymentType, loadRates]);

  const handleSelectDropshipper = (userId: string) => {
    if (!isDropshipperUserId(userId)) {
      toast.error("Invalid dropshipper user id");
      return;
    }
    setSelectedUserId(userId);
    setCourierZoneRows([]);
    setInitialCourierZoneRows([]);
    setHasOverride(false);
    setUpdatedAt(null);
  };

  const save = async () => {
    if (!isDropshipperUserId(selectedUserId)) return;
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

  const selectedDropshipper = useMemo(
    () => dropshippers.find((d) => d.userId === selectedUserId),
    [dropshippers, selectedUserId]
  );

  const selectedLabel = selectedDropshipper ? formatDropshipperLabel(selectedDropshipper) : undefined;

  return (
    <div className="space-y-4 mt-4">
      <div className="max-w-md">
        <Label>Select dropshipper</Label>
        <Select
          value={selectedUserId || undefined}
          onValueChange={handleSelectDropshipper}
          disabled={dropshippersLoading || dropshippers.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={dropshippersLoading ? "Loading dropshippers…" : "Choose dropshipper…"}>
              {selectedLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {dropshippers.map((d) => (
              <SelectItem key={d.userId} value={d.userId}>
                {formatDropshipperLabel(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUserId ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
          {dropshippersLoading
            ? "Loading dropshippers…"
            : dropshippers.length === 0
              ? "No dropshippers found."
              : "Select a dropshipper to configure courier-specific rate overrides"}
        </div>
      ) : (
        <>
          <div className="text-xs text-text-muted space-y-1">
            {selectedDropshipper && (
              <p>
                Editing rates for{" "}
                <span className="font-medium text-text-primary">{selectedDropshipper.name}</span>
                {selectedDropshipper.email ? ` · ${selectedDropshipper.email}` : ""}
              </p>
            )}
            <p className="font-mono text-[11px] text-text-muted/80">User._id: {selectedUserId}</p>
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
