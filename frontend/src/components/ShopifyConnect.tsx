import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CheckCircle2,
  Link2,
  Link2Off,
  RefreshCw,
  ShoppingBag,
  AlertCircle,
  Clock,
} from "lucide-react";
import * as shopifyService from "@/services/shopifyService";
import type { ShopifyStatus } from "@/services/shopifyService";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShopifyConnect() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await shopifyService.getShopifyStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();

    // Handle redirect back from Shopify OAuth
    const params = new URLSearchParams(window.location.search);
    const shopifyParam = params.get("shopify");
    if (shopifyParam === "connected") {
      toast.success("Shopify store connected successfully!");
      // Clean the URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
      void loadStatus();
    } else if (shopifyParam === "error") {
      toast.error("Shopify connection failed");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadStatus]);

  const handleConnect = async () => {
    const raw = shop.trim();
    if (!raw) {
      toast.error("Shop domain is required");
      return;
    }
    // Normalise: strip protocol/trailing slash
    const normalised = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");

    if (!normalised.toLowerCase().endsWith(".myshopify.com")) {
      toast.error("Invalid shop domain. It must end with .myshopify.com");
      return;
    }

    setConnecting(true);
    try {
      const { url } = await shopifyService.initiateShopifyConnect(normalised);
      window.location.href = url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start Shopify connection");
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await shopifyService.syncOrders();
      toast.success("Orders synced successfully");
      void loadStatus();
      // If an orders list is currently mounted, ask it to refetch.
      window.dispatchEvent(new Event("shipamaze:refetch:orders"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect this Shopify store? Existing synced orders will remain.")) return;
    setDisconnecting(true);
    try {
      await shopifyService.disconnectShopify();
      toast.success("Shopify store disconnected");
      setStatus({ connected: false });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-card shadow-card p-6 animate-pulse">
        <div className="h-5 w-32 bg-surface-2 rounded mb-3" />
        <div className="h-4 w-64 bg-surface-2 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card shadow-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#96bf48]/10 border border-[#96bf48]/20 shrink-0">
          <ShoppingBag className="h-5 w-5 text-[#5a8e00]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary">Shopify Integration</h3>
          <p className="text-sm text-text-muted mt-0.5">
            Connect your Shopify store to import orders into ShipAmaze.
          </p>
        </div>
        {status?.connected && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-success-light text-success-dark border border-success/30 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        )}
      </div>

      {status?.connected ? (
        /* ── Connected state ── */
        <div className="space-y-4">
          {/* Store info */}
          <div className="rounded-lg border border-border bg-surface-2/50 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-text-muted shrink-0" />
              <span className="font-mono text-text-primary">{status.shopDomain}</span>
            </div>
            <div className="flex items-center gap-2 text-text-muted">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Connected {formatDate(status.installedAt)}</span>
            </div>
            {status.lastSyncedAt && (
              <div className="flex items-center gap-2 text-text-muted">
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span>Last synced {formatDate(status.lastSyncedAt)}</span>
              </div>
            )}
          </div>

          {/* No orders synced yet */}
          {!status.lastSyncedAt && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-light/40 p-3">
              <AlertCircle className="h-4 w-4 text-warning-dark mt-0.5 shrink-0" />
              <p className="text-sm text-warning-dark">
                No orders synced yet. Click "Sync Orders" to import your Shopify orders.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync Orders"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="gap-2 text-danger border-danger/30 hover:bg-danger-light"
            >
              <Link2Off className="h-4 w-4" />
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      ) : (
        /* ── Not connected state ── */
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shopify-domain">Your Shopify store URL</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="shopify-domain"
                  placeholder="mystore.myshopify.com"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
                />
              </div>
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2 shrink-0"
              >
                <Link2 className="h-4 w-4" />
                {connecting ? "Redirecting…" : "Connect Shopify"}
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Enter your store domain (e.g. <span className="font-mono">mystore.myshopify.com</span>).
            </p>
          </div>

          {/* Info box */}
          <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-2 text-sm text-text-muted">
            <p className="font-medium text-text-secondary">What this does:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Securely connects via Shopify OAuth — no password needed</li>
              <li>Imports your orders into ShipAmaze for shipping</li>
              <li>Sync anytime with one click</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
