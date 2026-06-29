import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { AlertTriangle, Download, Phone, RefreshCw, RotateCcw, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import * as ndrService from "@/services/ndrService";
import { syncNdrFromVelocity } from "@/services/velocityService";
import { Input } from "@/components/ui/input";

const ndrTabs = ["Active", "Initiated", "Closed"] as const;
const reasonColors: Record<string, string> = {
  "Not at Home": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Wrong Address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Fake Attempt": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Incomplete Address": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  NDR: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Otp Verified Cancellation": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Other: "bg-surface-2 text-text-secondary",
};

function reasonBadgeClass(reason: string) {
  return reasonColors[reason] ?? "bg-surface-2 text-text-secondary";
}

export default function AdminNDR() {
  const [tab, setTab] = useState<string>("Active");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [actionAwb, setActionAwb] = useState<string | null>(null);
  const { data: ndrOrders = [], isLoading, refetch } = useNdrOrders();

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await syncNdrFromVelocity(120);
      if (!silent) {
        toast.success(
          `Synced ${result.upserted} NDR order${result.upserted === 1 ? "" : "s"} from Velocity` +
            (result.errors > 0 ? ` (${result.errors} errors)` : "")
        );
      }
      await refetch();
      return result;
    } catch (err: unknown) {
      if (!silent) {
        toast.error(`Velocity sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refetch]);

  // Auto-sync from Velocity when page loads so NDR tab matches Velocity panel
  useEffect(() => {
    if (autoSynced || isLoading) return;
    setAutoSynced(true);
    void runSync(true);
  }, [autoSynced, isLoading, runSync]);

  const filtered = ndrOrders.filter((n) => {
    if (n.status !== tab) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [n.awb, n.customer, n.phone, n.seller, n.reason, n.nextAction, n.orderId, n.carrier]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
  });

  const handleAction = async (awb: string, action: "reattempt" | "rto") => {
    setActionAwb(awb);
    try {
      await ndrService.submitNdrAction(awb, {
        action,
        remarks: action === "reattempt" ? "Re-attempt requested from ShipAmaze NDR Management" : "RTO requested from ShipAmaze NDR Management",
      });
      toast.success(
        action === "reattempt"
          ? `Re-attempt submitted to Velocity for ${awb}`
          : `RTO request submitted to Velocity for ${awb}`
      );
      await refetch();
    } catch (err: unknown) {
      toast.error(`Velocity action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionAwb(null);
    }
  };

  const handleExport = () => {
    downloadCSV(
      "ndr_export",
      ["Order ID", "AWB", "Customer", "Phone", "Seller", "Courier", "Reason", "Attempts", "Status", "Last Update"],
      filtered.map((n) => [
        n.orderId ?? "",
        n.awb,
        n.customer,
        n.phone,
        n.seller,
        n.carrier ?? "",
        n.reason,
        n.attempts,
        n.status,
        n.lastUpdate,
      ])
    );
    toast.success(`Exported ${filtered.length} NDR records`);
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading NDR data...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="NDR Management"
        breadcrumb={["Admin", "NDR"]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={syncing}
              onClick={() => void runSync(false)}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync from Velocity"}
            </Button>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />
      <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-5 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
        <div>
          <p className="font-medium text-warning-dark">
            {ndrOrders.filter((n) => n.status === "Active").length} active NDR cases need action
          </p>
          <p className="text-sm text-text-secondary">
            Orders sync from Velocity every 10 minutes. Use &quot;Sync from Velocity&quot; for immediate refresh.
            Re-attempt or force RTO after checking customer reachability and delivery reason.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b border-border">
          {ndrTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t}
              <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">
                {ndrOrders.filter((n) => n.status === t).length}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search AWB, customer, seller..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No NDR orders"
          description={
            tab === "Active" && ndrOrders.length === 0
              ? "No NDR orders synced yet. Click Sync from Velocity to pull NDR-raised shipments."
              : `No ${tab.toLowerCase()} NDR orders found`
          }
          actionLabel={ndrOrders.length === 0 ? "Sync from Velocity" : undefined}
          onAction={ndrOrders.length === 0 ? () => void runSync(false) : undefined}
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Order / AWB</th>
                <th className="p-3 text-left font-medium text-text-secondary">Customer</th>
                <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
                <th className="p-3 text-left font-medium text-text-secondary">Reason</th>
                <th className="p-3 text-left font-medium text-text-secondary">Attempts</th>
                <th className="p-3 text-left font-medium text-text-secondary">Last Update</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => (
                <tr key={n.awb} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3">
                    {n.orderId ? (
                      <p className="font-mono text-xs text-text-primary truncate max-w-[140px]" title={n.orderId}>
                        {n.orderId}
                      </p>
                    ) : null}
                    <p className="font-mono text-xs text-primary">{n.awb}</p>
                    {n.seller ? <p className="text-[11px] text-text-muted mt-0.5">{n.seller}</p> : null}
                  </td>
                  <td className="p-3">
                    <p className="text-text-primary">{n.customer}</p>
                    <p className="text-xs text-text-muted">{n.phone}</p>
                  </td>
                  <td className="p-3 text-text-secondary">
                    <p>{n.carrier || "Not synced"}</p>
                    {n.actionStatus ? (
                      <p className="mt-1 text-[11px] text-success">
                        {n.actionStatus === "provider_synced" ? "Velocity synced" : n.actionStatus}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", reasonBadgeClass(n.reason))}>
                      {n.reason}
                    </span>
                  </td>
                  <td className="p-3 text-text-secondary">{n.attempts}</td>
                  <td className="p-3 text-text-muted">
                    <p>{n.lastUpdate}</p>
                    {n.actionMessage ? (
                      <p className="mt-1 max-w-[220px] text-[11px] text-text-secondary" title={n.actionMessage}>
                        {n.actionMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 flex gap-1">
                    {n.status === "Active" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 gap-1"
                          onClick={() => window.open(`tel:${n.phone}`, "_self")}
                        >
                          <Phone className="h-3 w-3" />
                          Call
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 gap-1"
                          disabled={actionAwb === n.awb}
                          onClick={() => handleAction(n.awb, "reattempt")}
                        >
                          <Send className="h-3 w-3" />
                          {actionAwb === n.awb ? "Sending..." : "Re-attempt"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 text-danger gap-1"
                          disabled={actionAwb === n.awb}
                          onClick={() => handleAction(n.awb, "rto")}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {actionAwb === n.awb ? "Sending..." : "Force RTO"}
                        </Button>
                      </>
                    ) : (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          n.status === "Closed"
                            ? "bg-surface-2 text-text-muted"
                            : "bg-secondary-light text-secondary-dark"
                        )}
                      >
                        {n.status}
                      </span>
                    )}
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
