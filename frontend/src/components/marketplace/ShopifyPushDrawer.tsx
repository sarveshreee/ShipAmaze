import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Link2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";
import { useAuth } from "@/contexts/AuthContext";
import * as shopifyService from "@/services/shopifyService";
import type { ShopifyProductPushStatus } from "@/services/shopifyService";
import { ApiError } from "@/lib/apiClient";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: SupplierProduct | null;
}

function channelsPath(role: string | null | undefined): string {
  if (role === "admin") return "/admin/channels";
  return "/dropshipper/channels";
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    const b = err.body as { message?: string; error?: string } | undefined;
    if (b?.message?.trim()) return b.message;
    if (b?.error?.trim()) return b.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export function ShopifyPushDrawer({ open, onOpenChange, product }: Props) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [sellingPrice, setSellingPrice] = useState("");
  const [pushing, setPushing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [pushStatus, setPushStatus] = useState<ShopifyProductPushStatus | null>(null);

  const defaultSellingPrice = useMemo(() => {
    if (!product) return "";
    const sp = Number(product.selling_price);
    if (Number.isFinite(sp) && sp > 0) return String(sp);
    return String(Math.ceil(getFinalProductPrice(product)));
  }, [product]);

  const loadStatus = useCallback(async () => {
    if (!product?.id) return;
    setLoadingStatus(true);
    try {
      const status = await shopifyService.getProductPushStatus(product.id);
      setPushStatus(status);
    } catch (e) {
      setPushStatus({ connected: false });
      toast.error(errMsg(e));
    } finally {
      setLoadingStatus(false);
    }
  }, [product?.id]);

  useEffect(() => {
    if (!open || !product) return;
    setSellingPrice(defaultSellingPrice);
    void loadStatus();
  }, [open, product, defaultSellingPrice, loadStatus]);

  const margin = useMemo(() => {
    const sp = Number(sellingPrice) || 0;
    if (!product || !sp) return null;
    const cost = getFinalProductPrice(product);
    const profit = sp - cost;
    const pct = cost > 0 ? (profit / cost) * 100 : 0;
    return { profit, pct, cost };
  }, [sellingPrice, product]);

  const handlePush = async () => {
    if (!product || !pushStatus?.connected) return;
    const sp = Number(sellingPrice);
    if (!Number.isFinite(sp) || sp <= 0) {
      toast.error("Enter a valid selling price");
      return;
    }
    setPushing(true);
    try {
      const result = await shopifyService.pushProductToShopify({
        productId: product.id,
        sellingPrice: sp,
      });
      toast.success(
        result.updated
          ? `Product updated on Shopify (ID: ${result.shopifyProductId})`
          : `Product published to Shopify (ID: ${result.shopifyProductId})`
      );
      await loadStatus();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPushing(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setPushStatus(null);
      setSellingPrice("");
    }
    onOpenChange(v);
  };

  if (!product) return null;

  const connected = pushStatus?.connected === true;
  const published = connected && pushStatus?.published === true;
  const disabled = !connected || pushing || loadingStatus;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Push to Shopify</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking Shopify connection…
            </div>
          ) : !connected ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm space-y-3">
              <p className="text-text-primary">
                Connect your Shopify store from Channels to publish products.
              </p>
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => {
                  handleClose(false);
                  navigate(channelsPath(role));
                }}
              >
                <Link2 className="h-4 w-4" />
                Go to Channels
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm space-y-2">
              <div className="flex items-center gap-2 text-success font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {pushStatus.connectionStatus ?? "Connected"}
              </div>
              <div className="grid gap-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Store name</span>
                  <span className="font-medium text-right">{pushStatus.shopName ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Shop domain</span>
                  <span className="font-medium text-right break-all">{pushStatus.shopDomain}</span>
                </div>
              </div>
            </div>
          )}

          {published && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-primary">Already published to Shopify</p>
              <p className="text-xs text-muted-foreground mt-1">
                Shopify Product ID: <span className="font-mono">{pushStatus.shopifyProductId}</span>
              </p>
            </div>
          )}

          <div className="flex gap-3 p-3 rounded-xl bg-muted/40">
            <ProductThumbnail
              productId={product.id}
              images={product.images}
              hasImage={product.has_image}
              alt={product.name}
              className="h-16 w-16 rounded-lg object-cover"
              fallbackClassName="h-16 w-16 rounded-lg"
            />
            <div className="min-w-0">
              <p className="font-medium truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.sku}</p>
              <p className="text-sm font-semibold mt-1">{formatProductPriceInr(getFinalProductPrice(product))}</p>
            </div>
          </div>

          {connected && (
            <>
              <div className="space-y-1.5">
                <Label>Your selling price (₹)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="e.g. 599"
                  disabled={pushing}
                />
              </div>

              {margin && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span>{formatProductPriceInr(margin.cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Profit / order</span>
                    <span className={margin.profit >= 0 ? "text-primary font-medium" : "text-destructive font-medium"}>
                      ₹{margin.profit.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margin</span>
                    <span className={margin.pct >= 0 ? "text-primary font-medium" : "text-destructive font-medium"}>
                      {margin.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="text-xs text-muted-foreground border rounded-lg p-2 bg-muted/30">
            RTO &amp; RVP charges apply based on weight ({product.weight || "500g"}). Final payouts reflect after delivery.
          </div>

          <Button className="w-full gap-2" onClick={() => void handlePush()} disabled={disabled}>
            {pushing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {published ? "Updating on Shopify…" : "Publishing to Shopify…"}
              </>
            ) : !connected ? (
              "Connect store to publish"
            ) : published ? (
              <>
                Update on Shopify <ExternalLink className="h-4 w-4" />
              </>
            ) : (
              <>
                Push to Shopify <ExternalLink className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
