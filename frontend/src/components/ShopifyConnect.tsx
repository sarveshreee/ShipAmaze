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
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Link2Off,
  PlusCircle,
  RefreshCw,
  ShoppingBag,
  AlertCircle,
  Clock,
} from "lucide-react";
import * as shopifyService from "@/services/shopifyService";
import type { ShopifyConnectionStatus, ShopifyStatus } from "@/services/shopifyService";
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

const DEFAULT_SHOPIFY_REDIRECT_URI = "https://api.shipamaze.com/api/shopify/callback";
const DEFAULT_SHOPIFY_APP_URL = "https://shipamaze.com";
const SHOPIFY_ADMIN_API_SCOPES =
  "read_customers,write_customers,read_fulfillments,write_fulfillments,write_locations,read_locations," +
  "read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders," +
  "read_third_party_fulfillment_orders,write_third_party_fulfillment_orders," +
  "read_assigned_fulfillment_orders,write_assigned_fulfillment_orders," +
  "read_orders,write_orders,read_products,write_products";

function normaliseShopDomain(raw: string): string {
  let normalised = raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/$/, "").toLowerCase();
  if (normalised && !normalised.includes(".")) normalised = `${normalised}.myshopify.com`;
  return normalised;
}

function SetupUrlCopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Copied!");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <span className="block font-medium text-text-secondary">{label}</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <code className="flex-1 min-w-0 rounded-md border border-border bg-muted/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-primary break-all dark:bg-muted/30">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCopy()}
          className="shrink-0 gap-1.5 self-start sm:self-stretch sm:px-3"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" />
              <span className="text-xs">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span className="text-xs">Copy</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function ShopifyConnect() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState("");
  const [shopifyApiKey, setShopifyApiKey] = useState("");
  const [shopifyApiSecret, setShopifyApiSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncingShopDomain, setSyncingShopDomain] = useState<string | null>(null);
  const [disconnectingShopDomain, setDisconnectingShopDomain] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectShopDomain, setDisconnectShopDomain] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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
      setShowAddForm(true);
      toast.message("Enter your custom app API Key and Secret, then click Connect Shopify.");
      const next = new URLSearchParams(params);
      next.delete("shopify_install");
      const qs = next.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }

    const shopifyParam = params.get("shopify");
    if (shopifyParam === "connected") {
      toast.success("Shopify store connected successfully.");
      setShowAddForm(false);
      setShop("");
      setShopifyApiKey("");
      setShopifyApiSecret("");
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

  const connections: ShopifyConnectionStatus[] =
    status?.connections ??
    (status?.connected && status.shopDomain
      ? [
          {
            id: status.shopDomain,
            connected: true,
            shopDomain: status.shopDomain,
            scope: status.scope ?? "",
            installedAt: status.installedAt ?? "",
            lastSyncedAt: status.lastSyncedAt ?? null,
            syncCount: status.syncCount,
            lastSyncError: status.lastSyncError,
            syncedOrdersCount: status.syncedOrdersCount,
            tokenHealth: status.tokenHealth,
            needsReconnect: status.needsReconnect,
            connectionMessage: status.connectionMessage,
          },
        ]
      : []);

  const handleConnect = async () => {
    const normalised = normaliseShopDomain(shop);
    if (!normalised) {
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

    if (!normalised.endsWith(".myshopify.com")) {
      toast.error("Invalid shop domain. It must end with .myshopify.com");
      return;
    }

    const existing = connections.find((c) => c.shopDomain.toLowerCase() === normalised);
    const existingNeedsReconnect =
      existing && (existing.needsReconnect || (existing.tokenHealth && existing.tokenHealth !== "ok"));
    if (existing && !existingNeedsReconnect) {
      toast.error("This Shopify store is already connected to your ShipAmaze account.");
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

  const handleSync = async (shopDomain: string) => {
    setSyncingShopDomain(shopDomain);
    try {
      const r = await shopifyService.syncOrders(shopDomain);
      const parts = [
        `${r.synced} fetched`,
        `${r.inserted} saved`,
        `${r.updated} updated`,
        typeof r.skipped === "number" && r.skipped > 0 ? `${r.skipped} skipped` : null,
      ].filter(Boolean);
      const skipDetail =
        r.skipReasons && r.skipReasons.length > 0
          ? r.skipReasons
              .slice(0, 3)
              .map((s) => `${s.orderName || s.shopifyId}: ${s.reason}`)
              .join("; ")
          : undefined;
      toast.success("Orders synced", {
        description: skipDetail
          ? `${shopDomain}: ${parts.join(" · ")} — ${skipDetail}`
          : `${shopDomain}: ${parts.join(" · ")}`,
      });
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
      void loadStatus();
    } finally {
      setSyncingShopDomain(null);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectShopDomain) return;
    setDisconnectingShopDomain(disconnectShopDomain);
    try {
      await shopifyService.disconnectShopify(disconnectShopDomain);
      toast.success("Shopify disconnected. Historical orders are unchanged.");
      setDisconnectOpen(false);
      setDisconnectShopDomain(null);
      await loadStatus();
      setShopifyApiKey("");
      setShopifyApiSecret("");
    } catch (e: unknown) {
      toast.error(errMsg(e));
    } finally {
      setDisconnectingShopDomain(null);
    }
  };

  const setupRedirectUri = status?.redirectUri?.trim() || DEFAULT_SHOPIFY_REDIRECT_URI;
  const setupAppUrl = status?.appUrl?.trim() || DEFAULT_SHOPIFY_APP_URL;
  const formShopDomain = normaliseShopDomain(shop);
  const reconnectTarget = connections.find((c) => c.shopDomain.toLowerCase() === formShopDomain);
  const isReconnect =
    Boolean(reconnectTarget && (reconnectTarget.needsReconnect || reconnectTarget.tokenHealth !== "ok"));
  const formVisible = connections.length === 0 || showAddForm || isReconnect;

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
              Future imports and webhooks will stop for {disconnectShopDomain ?? "this store"}. Orders already synced stay in ShipAmaze.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisconnectOpen(false)}
              disabled={Boolean(disconnectingShopDomain)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDisconnect()}
              disabled={Boolean(disconnectingShopDomain)}
            >
              {disconnectingShopDomain ? "Disconnecting..." : "Disconnect"}
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
          {connections.length > 0 && connections.every((c) => !c.needsReconnect && c.tokenHealth === "ok") && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-success-light text-success-dark border border-success/30 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> {connections.length} Connected
            </span>
          )}
          {connections.some((c) => c.needsReconnect || c.tokenHealth !== "ok") && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-warning-light text-warning-dark border border-warning/30 shrink-0">
              <AlertCircle className="h-3.5 w-3.5" /> Reconnect required
            </span>
          )}
        </div>

        {connections.length > 0 ? (
          <div className="space-y-4">
            {connections.map((conn) => {
              const showReconnect =
                Boolean(conn.needsReconnect || (conn.tokenHealth && conn.tokenHealth !== "ok"));
              const connectionWarning = conn.connectionMessage?.trim() || conn.lastSyncError?.trim() || null;
              const syncing = syncingShopDomain === conn.shopDomain;
              const disconnecting = disconnectingShopDomain === conn.shopDomain;

              return (
                <div key={conn.id || conn.shopDomain} className="rounded-lg border border-border bg-surface-2/50 p-4 space-y-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-text-muted shrink-0" />
                        <span className="font-mono text-text-primary break-all">{conn.shopDomain}</span>
                      </div>
                      <div className="flex items-center gap-2 text-text-muted">
                        <Clock className="h-4 w-4 shrink-0" />
                        <span>Connected {formatDate(conn.installedAt)}</span>
                      </div>
                      {conn.lastSyncedAt && (
                        <div className="flex items-center gap-2 text-text-muted">
                          <RefreshCw className="h-4 w-4 shrink-0" />
                          <span>Last synced {formatDate(conn.lastSyncedAt)}</span>
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border shrink-0",
                        showReconnect
                          ? "bg-warning-light text-warning-dark border-warning/30"
                          : "bg-success-light text-success-dark border-success/30"
                      )}
                    >
                      {showReconnect ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {showReconnect ? "Reconnect required" : "Connected"}
                    </span>
                  </div>

                  {typeof conn.syncedOrdersCount === "number" && (
                    <p className="text-xs text-text-muted">
                      Synced orders from this store: <span className="font-medium text-text-primary">{conn.syncedOrdersCount}</span>
                      {typeof conn.syncCount === "number" && conn.syncCount > 0 ? (
                        <span className="text-text-muted"> · Sync runs: {conn.syncCount}</span>
                      ) : null}
                    </p>
                  )}

                  {connectionWarning ? (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-light/30 p-2 text-xs text-warning-dark">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{connectionWarning}</span>
                    </div>
                  ) : null}

                  {!conn.lastSyncedAt && !showReconnect && (
                    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-light/40 p-3">
                      <AlertCircle className="h-4 w-4 text-warning-dark mt-0.5 shrink-0" />
                      <p className="text-sm text-warning-dark">
                        No orders synced yet. Use &quot;Sync orders&quot; to import Shopify orders.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {showReconnect ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShop(conn.shopDomain);
                          setShowAddForm(true);
                        }}
                        disabled={connecting || syncing}
                        className="gap-2"
                      >
                        <Link2 className="h-4 w-4" />
                        Reconnect
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void handleSync(conn.shopDomain)}
                        disabled={Boolean(syncingShopDomain)}
                        className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
                      >
                        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                        {syncing ? "Syncing..." : "Sync orders"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setDisconnectShopDomain(conn.shopDomain);
                        setDisconnectOpen(true);
                      }}
                      disabled={disconnecting || Boolean(syncingShopDomain)}
                      className="gap-2 text-danger border-danger/30 hover:bg-danger-light"
                    >
                      <Link2Off className="h-4 w-4" />
                      {disconnecting ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  </div>
                </div>
              );
            })}

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShop("");
                  setShopifyApiKey("");
                  setShopifyApiSecret("");
                  setShowAddForm((v) => !v);
                }}
                disabled={connecting}
                className="w-full border-dashed gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                {showAddForm ? "Hide Shopify account form" : "ADD Another Shopify Account"}
              </Button>
          </div>
        ) : null}

        {formVisible ? (
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
                {connecting ? "Redirecting to Shopify..." : isReconnect ? "Reconnect Shopify" : "Connect Shopify"}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3 text-sm text-text-muted">
              <p className="font-medium text-text-secondary">Setup (each merchant)</p>
              <ol className="space-y-3 text-xs">
                <li className="flex gap-2">
                  <span className="font-medium text-text-secondary shrink-0">1.</span>
                  <span>Shopify Admin → Settings → Apps → Develop apps → Create an app</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-text-secondary shrink-0">2.</span>
                  <SetupUrlCopyRow label="Redirect URI" url={setupRedirectUri} />
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-text-secondary shrink-0">3.</span>
                  <SetupUrlCopyRow label="App URL" url={setupAppUrl} />
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-text-secondary shrink-0">4.</span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <SetupUrlCopyRow label="Scopes" url={SHOPIFY_ADMIN_API_SCOPES} />
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      In your app configuration, enable each scope individually (select all listed above — do not paste the
                      whole comma-separated line as one entry).
                    </p>
                  </div>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-text-secondary shrink-0">5.</span>
                  <span>Copy Client ID and Client Secret, then connect</span>
                </li>
              </ol>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
