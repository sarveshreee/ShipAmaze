import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiError } from "@/lib/apiClient";

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

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    const b = err.body as { message?: string; error?: string } | undefined;
    if (b && typeof b.message === "string" && b.message.trim()) return b.message;
    if (b && typeof b.error === "string" && b.error.trim()) return b.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export default function ShopifyConnect() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiSecret, setShopifyApiSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

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

    const params = new URLSearchParams(window.location.search);
    const installShop = params.get("shop")?.trim();
    if (params.get("shopify_install") === "1" && installShop) {
      setShop(installShop);
      toast.message("Enter your custom app API Key and Secret, then click Connect Shopify.");
      const next = new URLSearchParams(params);
      next.delete("shopify_install");
      const qs = next.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }

    const shopifyParam = params.get("shopify");
    if (shopifyParam === "connected") {
      toast.success("Shopify store connected successfully.");
      window.history.replaceState({}, document.title, window.location.pathname);
      void loadStatus();
    } else if (shopifyParam === "error") {
      const reason = params.get("shopify_reason")?.trim();
      toast.error(
        reason
          ? `Shopify connection failed: ${reason}`
          : "Shopify connection failed. Check credentials, redirect URL, or try again."
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadStatus]);

  const handleConnect = async () => {
    const raw = shop.trim();
    if (!raw) {
      toast.error("Shop domain is required");
      return;
    }
    if (!shopifyApiKey.trim()) {
      toast.error("API Key (Client ID) is required");
      return;
    }
    if (!shopifyApiSecret.trim()) {
      toast.error("API Secret is required");
      return;
    }

    let normalised = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/$/, "").toLowerCase();
    if (!normalised.includes(".")) normalised = `${normalised}.myshopify.com`;

    if (!normalised.endsWith(".myshopify.com")) {
      toast.error("Invalid shop domain. It must end with .myshopify.com");
      return;
    }

    setConnecting(true);
    try {
      const { url } = await shopifyService.initiateShopifyConnect(
        normalised,
        shopifyApiKey.trim(),
        shopifyApiSecret.trim()
      );
      window.location.href = url;
    } catch (e: unknown) {
      toast.error(errMsg(e));
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await shopifyService.syncOrders();
      const parts = [
        `${r.inserted} new`,
        `${r.updated} updated`,
        typeof r.skipped === "number" ? `${r.skipped} skipped` : null,
      ].filter(Boolean);
      toast.success("Orders synced", { description: parts.join(" · ") });
      void loadStatus();
      window.dispatchEvent(new Event("shipamaze:refetch:orders"));
    } catch (e: unknown) {
      const m = errMsg(e);
      toast.error("Sync failed", {
        description:
          m.includes("429") || m.toLowerCase().includes("already running")
            ? `${m} Wait a moment, then try again.`
            : m,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await shopifyService.disconnectShopify();
      toast.success("Shopify disconnected. Historical orders are unchanged.");
      setDisconnectOpen(false);
      setStatus({ connected: false });
      setShopifyApiKey("");
      setShopifyApiSecret("");
    } catch (e: unknown) {
      toast.error(errMsg(e));
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
    <>
      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Shopify?</DialogTitle>
            <DialogDescription>
              Future imports and webhooks will stop for this store. Orders already synced stay in ShipAmaze.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl bg-card shadow-card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#96bf48]/10 border border-[#96bf48]/20 shrink-0">
            <ShoppingBag className="h-5 w-5 text-[#5a8e00]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary">Shopify Integration</h3>
            <p className="text-sm text-text-muted mt-0.5">
              Connect with your store&apos;s custom app credentials (same flow as Importerr).
            </p>
          </div>
          {status?.connected && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-success-light text-success-dark border border-success/30 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
            </span>
          )}
        </div>

        {status?.connected ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2/50 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-text-muted shrink-0" />
                <span className="font-mono text-text-primary break-all">{status.shopDomain}</span>
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
              {typeof status.syncedOrdersCount === "number" && (
                <p className="text-xs text-text-muted pt-1">
                  Synced orders in your account: <span className="font-medium text-text-primary">{status.syncedOrdersCount}</span>
                  {typeof status.syncCount === "number" && status.syncCount > 0 ? (
                    <span className="text-text-muted"> · Manual sync runs: {status.syncCount}</span>
                  ) : null}
                </p>
              )}
              {status.lastSyncError ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-light/30 p-2 text-xs text-warning-dark mt-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{status.lastSyncError}</span>
                </div>
              ) : null}
            </div>

            {!status.lastSyncedAt && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-light/40 p-3">
                <AlertCircle className="h-4 w-4 text-warning-dark mt-0.5 shrink-0" />
                <p className="text-sm text-warning-dark">
                  No orders synced yet. Use &quot;Sync orders&quot; to import Shopify orders.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleSync()}
                disabled={syncing}
                className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
              >
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : "Sync orders"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setDisconnectOpen(true)}
                disabled={disconnecting || syncing}
                className="gap-2 text-danger border-danger/30 hover:bg-danger-light"
              >
                <Link2Off className="h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="shopify-domain">Store domain</Label>
                <Input
                  id="shopify-domain"
                  placeholder="mystore.myshopify.com"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  disabled={connecting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify-api-key">API Key (Client ID)</Label>
                <Input
                  id="shopify-api-key"
                  placeholder="From Shopify Admin → Develop apps"
                  value={shopifyApiKey}
                  onChange={(e) => setShopifyApiKey(e.target.value)}
                  disabled={connecting}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify-api-secret">API Secret (Client secret)</Label>
                <Input
                  id="shopify-api-secret"
                  type="password"
                  placeholder="From your custom app credentials"
                  value={shopifyApiSecret}
                  onChange={(e) => setShopifyApiSecret(e.target.value)}
                  disabled={connecting}
                  autoComplete="off"
                />
              </div>
              <Button
                onClick={() => void handleConnect()}
                disabled={connecting}
                className="w-full bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
              >
                <Link2 className="h-4 w-4" />
                {connecting ? "Redirecting to Shopify…" : "Connect Shopify"}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-2 text-sm text-text-muted">
              <p className="font-medium text-text-secondary">Setup (each merchant)</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Shopify Admin → Settings → Apps → Develop apps → Create an app</li>
                <li>
                  Under <span className="font-medium">Allowed redirection URL(s)</span>, add:{" "}
                  <span className="font-mono text-text-primary break-all">
                    {import.meta.env.DEV
                      ? "http://localhost:5000/api/shopify/callback"
                      : "your ShipAmaze API /api/shopify/callback URL"}
                  </span>
                </li>
                <li>Copy Client ID and Client secret here, then connect</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
