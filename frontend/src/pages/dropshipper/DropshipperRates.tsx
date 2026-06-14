import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Calculator, MapPin, Truck, CheckCircle2, XCircle, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as velocityService from "@/services/velocityService";
import * as approvalService from "@/services/approvalService";
import type { VelocityCarrier } from "@/services/velocityService";
import { usePincodes } from "@/hooks/useApiData";
import { DropshipperRateCalculatorPanel } from "@/components/dropshipper/DropshipperRateCalculatorPanel";
import { DropshipperCourierRateCardView } from "@/components/dropshipper/DropshipperCourierRateCardView";
import type { CourierZoneRow } from "@/lib/courierPricingUtils";
import {
  SHIPPING_RATE_CARD_REFETCH_EVENT,
  SHIPPING_RATE_CARD_STORAGE_KEY,
} from "@/lib/shippingRateCardUtils";

export default function DropshipperRates() {
  const [tab, setTab] = useState<"calculator" | "rateCard" | "pincheck">("calculator");
  const { data: pincodeList = [] } = usePincodes();
  const pincodeByPin = useMemo(() => new Map(pincodeList.map((p) => [p.pincode, p])), [pincodeList]);

  const [rateCardPayment, setRateCardPayment] = useState<"COD" | "Prepaid">("Prepaid");
  const [courierZoneRows, setCourierZoneRows] = useState<CourierZoneRow[]>([]);
  const [rateCardUpdatedAt, setRateCardUpdatedAt] = useState<string | null>(null);
  const [rateCardLoading, setRateCardLoading] = useState(false);
  const [rateCardError, setRateCardError] = useState<string | null>(null);

  const loadRateCard = useCallback(async (payment: "COD" | "Prepaid" = rateCardPayment) => {
    setRateCardLoading(true);
    setRateCardError(null);
    try {
      const card = await approvalService.getShippingRateCard(payment);
      setCourierZoneRows(
        (card.courierZoneRows ?? []).map((r) => ({
          courier: r.courier,
          zone: r.zone,
          rates: [...r.rates],
          codCharge: r.codCharge,
          active: r.active !== false,
        }))
      );
      setRateCardUpdatedAt(card.updatedAt ?? null);
    } catch (e) {
      setCourierZoneRows([]);
      setRateCardError(e instanceof Error ? e.message : "Failed to load rate card");
    } finally {
      setRateCardLoading(false);
    }
  }, [rateCardPayment]);

  useEffect(() => {
    if (tab !== "rateCard") return;
    void loadRateCard(rateCardPayment);
  }, [tab, rateCardPayment, loadRateCard]);

  useEffect(() => {
    const handler = () => {
      if (tab === "rateCard") void loadRateCard(rateCardPayment);
    };
    window.addEventListener(SHIPPING_RATE_CARD_REFETCH_EVENT, handler);
    return () => window.removeEventListener(SHIPPING_RATE_CARD_REFETCH_EVENT, handler);
  }, [tab, rateCardPayment, loadRateCard]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHIPPING_RATE_CARD_STORAGE_KEY && tab === "rateCard") {
        void loadRateCard(rateCardPayment);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tab, rateCardPayment, loadRateCard]);

  const [pincode, setPincode] = useState("");
  const [originPin, setOriginPin] = useState("400001");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinCarriers, setPinCarriers] = useState<VelocityCarrier[] | null>(null);
  const [pinNotServiceable, setPinNotServiceable] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const checkPin = async () => {
    const dest = pincode.replace(/\D/g, "").slice(0, 6);
    const origin = (originPin || "").replace(/\D/g, "").slice(0, 6);
    if (dest.length !== 6) {
      toast.error("Enter a valid 6-digit destination pincode");
      return;
    }
    if (origin.length !== 6) {
      toast.error("Enter a valid 6-digit origin pincode");
      return;
    }
    setPinLoading(true);
    setPinCarriers(null);
    setPinNotServiceable(false);
    setPinError(null);
    try {
      const resp = await velocityService.checkServiceability({
        from: origin,
        to: dest,
        payment_mode: "prepaid",
        shipment_type: "forward",
      });
      const ok = resp.serviceable !== false && (resp.data?.length ?? 0) > 0;
      if (ok) {
        setPinCarriers(resp.data ?? []);
      } else {
        setPinNotServiceable(true);
        if (resp.message) setPinError(resp.message);
      }
    } catch (e: unknown) {
      setPinNotServiceable(true);
      setPinError(e instanceof Error ? e.message : "Could not reach shipping service");
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Rates & Serviceability" breadcrumb={["Dropshipper", "Rates"]} />

      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {(
          [
            { id: "calculator" as const, label: "Rate Calculator", icon: Calculator },
            { id: "rateCard" as const, label: "Rate Card", icon: Truck },
            { id: "pincheck" as const, label: "Pincode Check", icon: MapPin },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-[1px] transition-colors whitespace-nowrap",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-text-secondary"
            )}
            type="button"
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calculator" && <DropshipperRateCalculatorPanel pincodeByPin={pincodeByPin} />}

      {tab === "rateCard" && (
        <DropshipperCourierRateCardView
          paymentType={rateCardPayment}
          onPaymentTypeChange={setRateCardPayment}
          rows={courierZoneRows}
          loading={rateCardLoading}
          error={rateCardError}
          updatedAt={rateCardUpdatedAt}
          onRefresh={() => void loadRateCard(rateCardPayment)}
        />
      )}

      {tab === "pincheck" && (
        <div className="max-w-lg">
          <div className="rounded-lg bg-card shadow-card p-6">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Pincode Serviceability Check
            </h3>
            <div className="space-y-3">
              <div>
                <Label>Origin Pincode</Label>
                <Input
                  value={originPin}
                  onChange={(e) => setOriginPin(e.target.value)}
                  placeholder="400001"
                  maxLength={6}
                />
              </div>
              <div>
                <Label>Destination Pincode</Label>
                <div className="flex gap-2">
                  <Input
                    value={pincode}
                    onChange={(e) => {
                      setPincode(e.target.value);
                      setPinCarriers(null);
                      setPinNotServiceable(false);
                    }}
                    placeholder="Enter 6-digit pincode"
                    className="flex-1"
                    maxLength={6}
                    onKeyDown={(e) => e.key === "Enter" && void checkPin()}
                  />
                  <Button
                    onClick={() => void checkPin()}
                    className="bg-primary text-primary-foreground hover:bg-primary-dark"
                    type="button"
                    disabled={pinLoading}
                  >
                    {pinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    {!pinLoading && "Check"}
                  </Button>
                </div>
              </div>
            </div>

            {pinCarriers && pinCarriers.length > 0 && (
              <div className="mt-4 rounded-lg bg-success-light p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium text-success-dark">
                    Serviceable — {pinCarriers.length} carrier{pinCarriers.length !== 1 ? "s" : ""} available
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {pinCarriers.map((c) => (
                    <div key={c.carrier_id} className="flex items-center justify-between text-sm bg-card rounded px-3 py-1.5">
                      <span className="text-text-primary">{c.carrier_name}</span>
                      <span className="text-text-muted">
                        Zone {c.zone}
                        {c.tat ? ` · ${c.tat}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pinNotServiceable && (
              <div className="mt-4 rounded-lg bg-danger-light p-4 text-center">
                <XCircle className="h-6 w-6 text-danger mx-auto mb-1" />
                <p className="font-medium text-danger-dark">Not serviceable or request failed</p>
                <p className="text-sm text-text-muted mt-1">
                  No couriers returned for {originPin} → {pincode}
                </p>
                {pinError && <p className="text-xs text-danger-dark/90 mt-2">{pinError}</p>}
                <Button variant="outline" size="sm" className="mt-3" type="button" onClick={() => void checkPin()} disabled={pinLoading}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
