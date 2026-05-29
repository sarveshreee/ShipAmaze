import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as velocityService from "@/services/velocityService";

const VELOCITY_WH_PATTERN = /^WH[A-Z0-9]+$/i;

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
  const linked = Boolean(velocityWarehouseId?.trim());
  const [value, setValue] = useState(velocityWarehouseId?.trim() ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(velocityWarehouseId?.trim() ?? "");
  }, [velocityWarehouseId]);

  const validate = (v: string) => {
    const t = v.trim();
    if (!t) return "Velocity warehouse ID is required";
    if (!VELOCITY_WH_PATTERN.test(t)) {
      return "Use Velocity format: WH followed by letters or digits (e.g. WHZBRR)";
    }
    return "";
  };

  const save = async () => {
    const err = validate(value);
    setError(err);
    if (err) return;
    setSaving(true);
    try {
      await velocityService.linkVelocityWarehouse({
        linkOnly: true,
        warehouseId: mongoId,
        velocityWarehouseId: value.trim(),
      });
      toast.success("Velocity warehouse linked successfully");
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
      await onUpdated();
    } catch (e) {
      toast.error(formatVelocityError(e, forbiddenHint, "Could not unlink"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Velocity warehouse link</p>
            <p className="text-[11px] text-text-muted">Link this address to an existing Velocity warehouse code.</p>
          </div>
        </div>
        <Badge variant={linked ? "default" : "secondary"} className="shrink-0">
          {linked ? "Linked" : "Not linked"}
        </Badge>
      </div>

      {linked && (
        <p className="text-xs font-mono text-text-secondary">
          Velocity ID: <span className="text-primary font-semibold">{velocityWarehouseId}</span>
        </p>
      )}

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
        <Button type="button" size="sm" className="bg-primary text-primary-foreground" disabled={saving} onClick={() => void save()}>
          {linked ? "Save" : "Link"}
        </Button>
        {linked && (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void unlink()}>
            Unlink
          </Button>
        )}
      </div>
    </div>
  );
}
