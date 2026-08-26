import { useEffect, useState } from "react";
import { ExternalLink, Link2, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ApiError } from "@/lib/apiClient";
import { linkEkartPickupLocation, unlinkEkartPickupLocation } from "@/services/pickupService";
import type { PickupAddress } from "@/types/logistics";
import { cn } from "@/lib/utils";

/** Elite seller panel — pickup locations are registered here (not via Durin API). */
export const EKART_ELITE_URL = "https://app.elite.ekartlogistics.in/";

type Props = {
  pickup: Pick<
    PickupAddress,
    "id" | "ekartLocationCode" | "ekartSyncStatus" | "ekartLastSyncAt" | "ekartSyncError"
  >;
  onUpdated?: () => void | Promise<void>;
  showProviderBrand?: boolean;
};

function formatSyncTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function EkartPickupSyncCard({ pickup, onUpdated, showProviderBrand = true }: Props) {
  const synced = Boolean(pickup.ekartLocationCode?.trim());
  const failed = pickup.ekartSyncStatus === "FAILED";
  const brand = showProviderBrand ? "Ekart" : "Ekart Elite";
  const [code, setCode] = useState(pickup.ekartLocationCode ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(pickup.ekartLocationCode ?? "");
  }, [pickup.ekartLocationCode]);

  const badgeClass = synced
    ? "border-success/40 bg-success-light text-success-dark"
    : failed
      ? "border-danger/40 bg-danger-light text-danger"
      : "border-border bg-muted text-text-muted";

  const label = synced
    ? showProviderBrand
      ? "Ekart synced"
      : "Elite synced"
    : failed
      ? showProviderBrand
        ? "Ekart sync failed"
        : "Elite sync failed"
      : showProviderBrand
        ? "Ekart not synced"
        : "Elite not synced";

  const onLink = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Paste the Elite location code first");
      return;
    }
    setBusy(true);
    try {
      const res = await linkEkartPickupLocation(pickup.id, trimmed);
      if (res.ekartSync?.synced) {
        toast.success(
          res.ekartSync.alreadySynced
            ? `${brand} already linked: ${res.ekartSync.locationCode}`
            : `${brand} linked: ${res.ekartSync.locationCode}`
        );
      } else if (res.ekartSync && "skipped" in res.ekartSync && res.ekartSync.skipped) {
        toast.warning(res.ekartSync.reason || `${brand} sync skipped`);
      } else {
        toast.error(
          (res.ekartSync && "error" in res.ekartSync && res.ekartSync.error) ||
            `${brand} sync failed`
        );
      }
      await onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async () => {
    setBusy(true);
    try {
      await unlinkEkartPickupLocation(pickup.id);
      toast.success(`${brand} unlinked`);
      setCode("");
      await onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unlink failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/80 bg-surface-elevated/40 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0 h-5", badgeClass)}>
          {label}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-2"
          onClick={() => window.open(EKART_ELITE_URL, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Open Elite
        </Button>
      </div>

      <p className="text-[11px] text-text-muted leading-snug">
        {synced ? (
          <>
            Last sync: {formatSyncTime(pickup.ekartLastSyncAt)}
            <span className="ml-2 font-mono text-text-secondary">{pickup.ekartLocationCode}</span>
          </>
        ) : (
          <>
            Add/confirm this warehouse in Elite (Settings → Addresses). Elite often does{" "}
            <strong>not</strong> show <code>location_code</code> on screen — ask your Ekart BD
            (Shivkumar) for the Durin location code for merchant TEC, or use{" "}
            <strong>Download Registered Addresses</strong> and look for Location Code / ID.
            Paste that code here. ShipAmaze cannot create Elite warehouses via API (unlike
            Lorrigo/Velocity).
          </>
        )}
      </p>

      {!synced ? (
        <div className="space-y-1.5">
          <Label className="text-[11px]">Elite location code</Label>
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. TEC_SUR_01"
              disabled={busy}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs shrink-0"
              disabled={busy}
              onClick={() => void onLink()}
            >
              <Link2 className={cn("h-3 w-3 mr-1", busy && "animate-pulse")} />
              Sync to {showProviderBrand ? "Ekart" : "Elite"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => void onLink()}
          >
            Update code
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-danger"
            disabled={busy}
            onClick={() => void onUnlink()}
          >
            <Unlink className="h-3 w-3 mr-1" />
            Unlink
          </Button>
        </div>
      )}

      {failed && pickup.ekartSyncError ? (
        <p className="text-[11px] text-danger leading-snug">{pickup.ekartSyncError}</p>
      ) : null}
    </div>
  );
}
