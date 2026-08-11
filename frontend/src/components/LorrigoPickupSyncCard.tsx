import { useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { ApiError } from "@/lib/apiClient";
import { retryLorrigoPickupSync } from "@/services/pickupService";
import type { PickupAddress } from "@/types/logistics";
import { cn } from "@/lib/utils";

type Props = {
  pickup: Pick<
    PickupAddress,
    "id" | "lorrigoPickupId" | "lorrigoSyncStatus" | "lorrigoLastSyncAt" | "lorrigoSyncError"
  >;
  onUpdated?: () => void | Promise<void>;
  /** Hide third-party provider branding from vendor-facing screens. */
  showProviderBrand?: boolean;
};

function formatSyncTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function LorrigoPickupSyncCard({ pickup, onUpdated, showProviderBrand = true }: Props) {
  const [busy, setBusy] = useState(false);
  const status = pickup.lorrigoSyncStatus;
  const synced = Boolean(pickup.lorrigoPickupId?.trim());
  const failed = status === "FAILED";
  // Treat SUCCESS-without-id as not synced (booking requires lorrigoPickupId).
  const brand = showProviderBrand ? "Lorrigo" : "alternate couriers";

  const badgeClass = synced
    ? "border-success/40 bg-success-light text-success-dark"
    : failed
      ? "border-danger/40 bg-danger-light text-danger"
      : "border-border bg-muted text-text-muted";

  const label = synced
    ? showProviderBrand
      ? "Lorrigo synced"
      : "Alternate synced"
    : failed
      ? showProviderBrand
        ? "Lorrigo sync failed"
        : "Alternate sync failed"
      : showProviderBrand
        ? "Lorrigo not synced"
        : "Alternate not synced";

  const onSync = async () => {
    setBusy(true);
    try {
      const res = await retryLorrigoPickupSync(pickup.id);
      if (res.lorrigoSync?.synced) {
        toast.success(
          res.lorrigoSync.alreadySynced
            ? showProviderBrand
              ? "Lorrigo pickup already linked"
              : "Alternate pickup already linked"
            : showProviderBrand
              ? `Lorrigo synced: ${res.lorrigoSync.pickupId}`
              : `Alternate pickup synced: ${res.lorrigoSync.pickupId}`
        );
      } else if (res.lorrigoSync?.skipped) {
        toast.warning(res.lorrigoSync.reason || `${brand} sync skipped`);
      } else {
        toast.error(res.lorrigoSync?.error || `${brand} sync failed`);
      }
      await onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/80 bg-surface-elevated/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0 h-5", badgeClass)}>
          {label}
        </Badge>
        {!synced ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => void onSync()}
          >
            {failed ? (
              <RefreshCw className={cn("h-3 w-3 mr-1", busy && "animate-spin")} />
            ) : (
              <Link2 className={cn("h-3 w-3 mr-1", busy && "animate-pulse")} />
            )}
            {failed
              ? "Retry Sync"
              : showProviderBrand
                ? "Sync to Lorrigo"
                : "Sync alternate"}
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] text-text-muted">
        {synced || pickup.lorrigoLastSyncAt ? (
          <>
            Last sync: {formatSyncTime(pickup.lorrigoLastSyncAt)}
            {pickup.lorrigoPickupId ? (
              <span className="ml-2 font-mono text-text-secondary">ID {pickup.lorrigoPickupId}</span>
            ) : null}
          </>
        ) : showProviderBrand ? (
          "Not linked to Lorrigo yet — sync before booking with Lorrigo couriers."
        ) : (
          "Not linked for alternate couriers yet — sync before booking with those couriers."
        )}
      </p>
      {failed && pickup.lorrigoSyncError ? (
        <p className="text-[11px] text-danger leading-snug">{pickup.lorrigoSyncError}</p>
      ) : null}
    </div>
  );
}
