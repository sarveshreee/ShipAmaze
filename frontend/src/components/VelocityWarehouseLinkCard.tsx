import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, ExternalLink, Copy, AlertTriangle } from "lucide-react";
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
  /** Used for friendlier 403 copy when the API returns a generic "Forbidden". */
  forbiddenHint?: "pickup" | "warehouse";
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
  forbiddenHint,
}: Props) {
  const storedCode = normalizeVelocityWarehouseCode(velocityWarehouseId);
  const linkStatus = getVelocityWarehouseLinkStatus(velocityWarehouseId);
  const linked = linkStatus === "linked";

  const [value, setValue] = useState(storedCode);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(storedCode);
    setError("");
  }, [storedCode]);

  const displayCode = useMemo(() => {
    if (linked) return storedCode;
    if (linkStatus === "invalid") return storedCode;
    return "";
  }, [linked, linkStatus, storedCode]);

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
          ? `Velocity warehouse updated to ${code}`
          : `Velocity warehouse linked: ${code}`
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
      toast.success("Velocity warehouse unlinked");
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
            <p className="text-sm font-semibold text-text-primary">Velocity warehouse link</p>
            <p className="text-[11px] text-text-muted">
              Create the warehouse in Velocity Dashboard, then paste the warehouse code here.
            </p>
          </div>
        </div>
        <VelocityWarehouseLinkStatusBadge velocityWarehouseId={velocityWarehouseId} className="shrink-0" />
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
            This pickup address is not linked to a Velocity warehouse. Orders cannot be booked until a warehouse is
            linked.
          </AlertDescription>
        </Alert>
      ) : null}

      {linkStatus === "invalid" ? (
        <Alert variant="destructive" className="py-2.5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Stored warehouse code &ldquo;{storedCode}&rdquo; is invalid. Enter a valid code (e.g. WHZBRR) and save, or
            unlink and re-link from Velocity Dashboard.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs text-text-muted">Velocity warehouse ID</Label>
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-primary text-primary-foreground"
          disabled={saving}
          onClick={() => void save()}
        >
          {linked ? "Update link" : "Link warehouse"}
        </Button>
        {linked || linkStatus === "invalid" ? (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void unlink()}>
            Unlink
          </Button>
        ) : null}
        {(linked || displayCode) && (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void copyWarehouseId()}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy warehouse ID
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={openVelocityDashboard}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Open Velocity Dashboard
        </Button>
      </div>
    </div>
  );
}
