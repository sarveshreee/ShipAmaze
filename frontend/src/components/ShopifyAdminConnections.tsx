import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/apiClient";
import * as shopifyService from "@/services/shopifyService";
import type { ShopifyAdminConnection } from "@/services/shopifyService";
import { RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    const b = err.body as { message?: string; error?: string } | undefined;
    if (b && typeof b.message === "string" && b.message.trim()) return b.message;
    if (b && typeof b.error === "string" && b.error.trim()) return b.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Failed to load connections";
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShopifyAdminConnections() {
  const [rows, setRows] = useState<ShopifyAdminConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { connections } = await shopifyService.listShopifyConnectionsAdmin();
      setRows(Array.isArray(connections) ? connections : []);
    } catch (e: unknown) {
      toast.error(errMsg(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 animate-pulse space-y-3">
        <div className="h-4 w-48 bg-surface-2 rounded" />
        <div className="h-24 bg-surface-2 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary shrink-0">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">All Shopify connections</h3>
            <p className="text-sm text-text-muted mt-0.5">
              Admin overview — access tokens are never returned by the API.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted py-4">No Shopify store connections in the database yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-left text-text-secondary">
                <th className="p-3 font-medium">Shop</th>
                <th className="p-3 font-medium">Owner user</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last sync</th>
                <th className="p-3 font-medium">Sync runs</th>
                <th className="p-3 font-medium min-w-[140px]">Last error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-3 font-mono text-xs text-text-primary">{r.shopDomain}</td>
                  <td className="p-3 font-mono text-xs text-text-muted break-all">{r.ownerUserId}</td>
                  <td className="p-3 capitalize">{r.role}</td>
                  <td className="p-3">
                    {r.isActive ? (
                      <span className="text-success-dark text-xs font-medium">Active</span>
                    ) : (
                      <span className="text-text-muted text-xs">Disconnected</span>
                    )}
                  </td>
                  <td className="p-3 text-text-muted text-xs whitespace-nowrap">{fmt(r.lastSyncedAt)}</td>
                  <td className="p-3 tabular-nums">{r.syncCount ?? 0}</td>
                  <td className="p-3 text-xs text-danger-dark break-words max-w-[200px]">
                    {r.lastSyncError || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
