import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: SupplierProduct | null;
}

const isProduction = import.meta.env.PROD;

export function ShopifyPushDrawer({ open, onOpenChange, product }: Props) {
  const [sellingPrice, setSellingPrice] = useState("");
  const [pushing, setPushing] = useState(false);

  const margin = useMemo(() => {
    const sp = Number(sellingPrice) || 0;
    if (!product || !sp) return null;
    const cost = getFinalProductPrice(product);
    const profit = sp - cost;
    const pct = cost > 0 ? (profit / cost) * 100 : 0;
    return { profit, pct, cost };
  }, [sellingPrice, product]);

  const handlePush = async () => {
    if (isProduction) {
      toast.info("Push to Shopify is coming soon. Connect your store under Channels in the meantime.");
      return;
    }
    if (!sellingPrice || Number(sellingPrice) <= 0) {
      toast.error("Enter a valid selling price");
      return;
    }
    setPushing(true);
    toast.info("Shopify product push is not available in this build (development preview only).");
    setPushing(false);
    onOpenChange(false);
    setSellingPrice("");
  };

  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Push to Shopify</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          {isProduction && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
              <p className="font-medium">Coming soon</p>
              <p className="mt-1 text-text-muted">
                Product push to your connected Shopify store is not enabled in production yet. Use{" "}
                <strong>Channels</strong> to connect a store and sync orders.
              </p>
            </div>
          )}

          <div className="flex gap-3 p-3 rounded-xl bg-muted/40">
            <img src={product.images[0] || "/placeholder.svg"} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="font-medium truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.sku}</p>
              <p className="text-sm font-semibold mt-1">{formatProductPriceInr(getFinalProductPrice(product))}</p>
            </div>
          </div>

          {!isProduction && (
            <>
              <div className="space-y-1.5">
                <Label>Your selling price (₹)</Label>
                <Input
                  type="number"
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

          <Button className="w-full" onClick={() => void handlePush()} disabled={pushing || isProduction}>
            {pushing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isProduction ? (
              "Coming soon"
            ) : (
              <>
                Preview push <ExternalLink className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
