import { PageHeader } from "@/components/PageHeader";
import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import * as approvalService from "@/services/approvalService";
import { ApiError } from "@/lib/apiClient";
import { usePincodes } from "@/hooks/useApiData";
import { useUnsavedChangesBlocker } from "@/hooks/useUnsavedChangesBlocker";
import { AdminRateCalculatorPanel } from "@/components/admin/AdminRateCalculatorPanel";
import { AdminCourierPricingPanel } from "@/components/admin/AdminCourierPricingPanel";
import type { PincodeService } from "@/types/logistics";
import { notifyShippingRateCardUpdated } from "@/lib/shippingRateCardUtils";
import {
  buildDefaultCourierZoneRows,
  buildDefaultEnterpriseRows,
  deriveLegacyRates,
  pricingEqual,
  type CourierZoneRow,
  type EnterpriseRateRow,
} from "@/lib/courierPricingUtils";

export default function AdminRates() {
  const { data: pincodeList = [] } = usePincodes();
  const [paymentType, setPaymentType] = useState<"COD" | "Prepaid">("Prepaid");
  const [courierZoneRows, setCourierZoneRows] = useState<CourierZoneRow[]>(() => buildDefaultCourierZoneRows());
  const [enterpriseRows, setEnterpriseRows] = useState<EnterpriseRateRow[]>(() =>
    buildDefaultEnterpriseRows(buildDefaultCourierZoneRows())
  );
  const [initialCourierZoneRows, setInitialCourierZoneRows] = useState<CourierZoneRow[]>(() =>
    buildDefaultCourierZoneRows()
  );
  const [initialEnterpriseRows, setInitialEnterpriseRows] = useState<EnterpriseRateRow[]>(() =>
    buildDefaultEnterpriseRows(buildDefaultCourierZoneRows())
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const card = await approvalService.getShippingRateCard(paymentType);
      const baseMatrix = card.rates?.length ? card.rates : deriveLegacyRates(buildDefaultCourierZoneRows());
      const zoneRows =
        card.courierZoneRows?.length
          ? card.courierZoneRows.map((r) => ({
              courier: r.courier,
              zone: r.zone,
              rates: [...r.rates],
              codCharge: r.codCharge,
              active: r.active !== false,
            }))
          : buildDefaultCourierZoneRows(baseMatrix);
      const entRows =
        card.enterpriseRows?.length
          ? card.enterpriseRows.map((r) => ({
              courier: r.courier,
              type: r.type,
              slab: r.slab,
              zoneRates: [...r.zoneRates],
              active: r.active !== false,
            }))
          : buildDefaultEnterpriseRows(zoneRows);
      setCourierZoneRows(zoneRows);
      setEnterpriseRows(entRows);
      setInitialCourierZoneRows(zoneRows.map((r) => ({ ...r, rates: [...r.rates] })));
      setInitialEnterpriseRows(entRows.map((r) => ({ ...r, zoneRates: [...r.zoneRates] })));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load rate card");
      const d = buildDefaultCourierZoneRows();
      setCourierZoneRows(d);
      setEnterpriseRows(buildDefaultEnterpriseRows(d));
      setInitialCourierZoneRows(d.map((r) => ({ ...r, rates: [...r.rates] })));
      setInitialEnterpriseRows(buildDefaultEnterpriseRows(d));
    } finally {
      setLoading(false);
    }
  }, [paymentType]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasChanges = !pricingEqual(
    courierZoneRows,
    initialCourierZoneRows,
    enterpriseRows,
    initialEnterpriseRows
  );

  useUnsavedChangesBlocker(hasChanges, "You have unsaved rate changes. Leave without saving?");

  const pincodeByPin = useMemo(() => {
    const m = new Map<string, PincodeService>();
    for (const p of pincodeList) {
      const pin = String(p.pincode ?? "").replace(/\D/g, "").slice(0, 6);
      if (pin.length === 6) m.set(pin, p as PincodeService);
    }
    return m;
  }, [pincodeList]);

  const switchPaymentType = (next: "COD" | "Prepaid") => {
    if (next === paymentType) return;
    if (hasChanges) {
      const ok = window.confirm("You have unsaved changes. Switch payment type and discard edits?");
      if (!ok) return;
    }
    setPaymentType(next);
  };

  const saveRates = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const rates = deriveLegacyRates(courierZoneRows);
      const saved = await approvalService.adminSaveShippingRateCard({
        paymentType,
        zones: ["A", "B", "C", "D", "E"],
        weights: ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"],
        rates,
        courierZoneRows,
        enterpriseRows,
      });
      const zoneRows = (saved.courierZoneRows ?? courierZoneRows).map((r) => ({
        ...r,
        rates: [...r.rates],
      }));
      const entRows = (saved.enterpriseRows ?? enterpriseRows).map((r) => ({
        ...r,
        zoneRates: [...r.zoneRates],
      }));
      setCourierZoneRows(zoneRows);
      setEnterpriseRows(entRows);
      setInitialCourierZoneRows(zoneRows.map((r) => ({ ...r, rates: [...r.rates] })));
      setInitialEnterpriseRows(entRows.map((r) => ({ ...r, zoneRates: [...r.zoneRates] })));
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
        Configure courier-wise pricing and click <strong>Save Rates</strong> to publish. Dropshipper
        rates sync from the saved matrix. Vendor changes still require{" "}
        <a href="/admin/approvals" className="text-primary underline">
          Pending Approvals
        </a>
        .
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,420px)_1fr] gap-6">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <AdminRateCalculatorPanel pincodeByPin={pincodeByPin} />
        </div>

        <AdminCourierPricingPanel
          paymentType={paymentType}
          onPaymentTypeChange={switchPaymentType}
          courierZoneRows={courierZoneRows}
          onCourierZoneRowsChange={setCourierZoneRows}
          enterpriseRows={enterpriseRows}
          onEnterpriseRowsChange={setEnterpriseRows}
          initialCourierZoneRows={initialCourierZoneRows}
          initialEnterpriseRows={initialEnterpriseRows}
          loading={loading}
          saving={saving}
          onSave={() => void saveRates()}
        />
      </div>
    </div>
  );
}
