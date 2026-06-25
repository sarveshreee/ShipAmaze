import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, ExternalLink, Copy, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as velocityService from "@/services/velocityService";
import {
  VELOCITY_WAREHOUSE_URL,
  getVelocityWarehouseLinkStatus,
  normalizeVelocityWarehouseCode,
  validateVelocityWarehouseCode,
} from "@/lib/velocityWarehouseLink";
import { VelocityWarehouseLinkStatusBadge } from "@/components/VelocityWarehouseLinkStatusBadge";

type Props = {
  mongoId: string;
  velocityWarehouseId?: string;
  onUpdated: () => void | Promise<void>;
  /** When set, identifies whether this is a pickup or vendor warehouse for the sync call. */
  kind?: "pickup" | "warehouse";
  /** Used for friendlier 403 copy when the API returns a generic "Forbidden". */
  forbiddenHint?: "pickup" | "warehouse";
  /** Hide third-party provider branding from vendor-facing screens. */
  showProviderBrand?: boolean;
};

function formatVelocityError(
  e: unknown,
  forbiddenHint: Props["forbiddenHint"],
  fallback: string
): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.status === 403) {
    if (e.message && e.message !== "Forbidden") return e.message;
    if (forbiddenHint === "pickup") return "You can only link your own pickup address.";
    if (forbiddenHint === "warehouse") return "You can only link your own warehouse.";
    return "You don't have permission for this action.";
  }
  return e.message;
}

export function VelocityWarehouseLinkCard({
  mongoId,
  velocityWarehouseId,
  onUpdated,
  kind = "pickup",
  forbiddenHint,
  showProviderBrand = true,
}: Props) {
  const storedCode = normalizeVelocityWarehouseCode(velocityWarehouseId);
  const linkStatus = getVelocityWarehouseLinkStatus(velocityWarehouseId);
  const linked = linkStatus === "linked";
  const providerName = showProviderBrand ? "Velocity" : "shipping provider";
  const warehouseName = showProviderBrand ? "Velocity warehouse" : "courier warehouse";
  const linkedLabels = showProviderBrand
    ? undefined
    : {
        linked: "Linked",
        not_linked: "Not linked",
        invalid: "Link invalid",
      };

  const [value, setValue] = useState(storedCode);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setValue(storedCode);
    setError("");
  }, [storedCode]);

  // Show manual section when already linked (to allow update/unlink) or when explicitly opened
  const manualVisible = showManual || linked || linkStatus === "invalid";

  const displayCode = useMemo(() => {
    if (linked) return storedCode;
    if (linkStatus === "invalid") return storedCode;
    return "";
  }, [linked, linkStatus, storedCode]);

  const syncToVelocity = async () => {
    setSaving(true);
    try {
      const params = kind === "warehouse"
        ? { warehouseId: mongoId, forceRecreate: true }
        : { pickupId: mongoId, forceRecreate: true };
      const resp = await velocityService.syncVelocityWarehouse(params);
      if (resp.data.skipped) {
        toast.warning(resp.data.reason ?? `${providerName} sync skipped — credentials may not be configured.`);
      } else if (resp.data.linked && resp.data.warehouse_id) {
        toast.success(`${warehouseName} linked: ${resp.data.warehouse_id}`);
        await onUpdated();
      }
    } catch (e) {
      toast.error(formatVelocityError(e, forbiddenHint, `Could not sync warehouse to ${providerName}`));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const err = validateVelocityWarehouseCode(value);
    setError(err);
    if (err) {
      toast.error(err);
      return;
    }
    const code = normalizeVelocityWarehouseCode(value);
    setSaving(true);
    try {
      await velocityService.linkVelocityWarehouse({
        linkOnly: true,
        warehouseId: mongoId,
        velocityWarehouseId: code,
      });
      toast.success(
        linked && code !== storedCode
          ? `${warehouseName} updated to ${code}`
          : `${warehouseName} linked: ${code}`
      );
      await onUpdated();
    } catch (e) {
      toast.error(formatVelocityError(e, forbiddenHint, "Could not link warehouse"));
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    setSaving(true);
    try {
      await velocityService.unlinkVelocityWarehouse(mongoId);
      toast.success(`${warehouseName} unlinked`);
      setValue("");
      setError("");
      await onUpdated();
    } catch (e) {
      toast.error(formatVelocityError(e, forbiddenHint, "Could not unlink warehouse"));
    } finally {
      setSaving(false);
    }
  };

  const copyWarehouseId = async () => {
    const code = displayCode || normalizeVelocityWarehouseCode(value);
    if (!code) {
      toast.error("No warehouse ID to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied ${code}`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const openVelocityDashboard = () => {
    window.open(VELOCITY_WAREHOUSE_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{showProviderBrand ? "Velocity warehouse link" : "Shipping warehouse link"}</p>
            <p className="text-[11px] text-text-muted">
              {linked
                ? `Warehouse synced with ${providerName}. Shipments can be booked using this address.`
                : `Sync this address with the ${providerName} to enable shipment booking.`}
            </p>
          </div>
        </div>
        <VelocityWarehouseLinkStatusBadge velocityWarehouseId={velocityWarehouseId} labels={linkedLabels} className="shrink-0" />
      </div>

      {displayCode ? (
        <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Linked warehouse code</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-primary tracking-wide">{displayCode}</p>
        </div>
      ) : null}

      {linkStatus === "not_linked" ? (
        <Alert className="border-warning/40 bg-warning-light/40 py-2.5 [&>svg]:text-warning-dark">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs text-warning-dark">
            This address is not linked to a {warehouseName}. Click <strong>{showProviderBrand ? "Sync to Velocity" : "Sync warehouse"}</strong> to register it
            automatically, or link a pre-existing warehouse manually.
          </AlertDescription>
        </Alert>
      ) : null}

      {linkStatus === "invalid" ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Stored warehouse code &ldquo;{storedCode}&rdquo; is invalid. Click <strong>{showProviderBrand ? "Sync to Velocity" : "Sync warehouse"}</strong> to
            re-register, or enter a valid code (e.g. WHZBRR) below.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Primary action: auto-sync */}
      {!linked ? (
        <Button
          type="button"
          size="sm"
          className="bg-primary text-primary-foreground w-full sm:w-auto"
          disabled={saving}
          onClick={() => void syncToVelocity()}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${saving ? "animate-spin" : ""}`} />
          {showProviderBrand ? "Sync to Velocity" : "Sync warehouse"}
        </Button>
      ) : null}

      {/* Toggle for manual code entry */}
      {!linked ? (
        <button
          type="button"
          className="text-[11px] text-text-muted underline-offset-2 hover:underline"
          onClick={() => setShowManual((s) => !s)}
        >
          {showManual ? "Hide manual entry" : "Link pre-existing warehouse manually"}
        </button>
      ) : null}

      {manualVisible ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-text-muted">{showProviderBrand ? "Velocity warehouse ID" : "Courier warehouse ID"}</Label>
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase());
              if (error) setError("");
            }}
            placeholder="e.g. WHZBRR"
            disabled={saving}
            className="font-mono text-sm"
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {manualVisible ? (
          <Button
            type="button"
            size="sm"
            variant={linked ? "default" : "outline"}
            className={linked ? "bg-primary text-primary-foreground" : ""}
            disabled={saving}
            onClick={() => void save()}
          >
            {linked ? "Update link" : "Link warehouse"}
          </Button>
        ) : null}
        {linked || linkStatus === "invalid" ? (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void unlink()}>
            Unlink
          </Button>
        ) : null}
        {(linked || displayCode) ? (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void copyWarehouseId()}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy warehouse ID
          </Button>
        ) : null}
        {linked ? (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void syncToVelocity()}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${saving ? "animate-spin" : ""}`} />
            Re-sync
          </Button>
        ) : null}
        {showProviderBrand ? (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={openVelocityDashboard}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open Velocity Dashboard
          </Button>
        ) : null}
      </div>
    </div>
  );
}
