import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, RotateCcw, Save } from "lucide-react";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";
import { useAuth } from "@/contexts/AuthContext";
import { computeProfitCalculator } from "@/lib/profitCalculator";
import {
  DEFAULT_PROFIT_CALCULATOR_SETTINGS,
  type ProfitCalculatorSettings,
} from "@/types/profitCalculator";
import * as profitCalculatorSettingsService from "@/services/profitCalculatorSettingsService";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: SupplierProduct | null;
  onPushToShopify?: () => void;
}

export function ProfitCalculatorModal({ open, onOpenChange, product, onPushToShopify }: Props) {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [sellingPrice, setSellingPrice] = useState("");
  const [expectedOrders, setExpectedOrders] = useState("");
  const [confirmPct, setConfirmPct] = useState("");
  const [deliveryPct, setDeliveryPct] = useState("");
  const [adSpend, setAdSpend] = useState("");
  const [misc, setMisc] = useState("");
  const [calculated, setCalculated] = useState(false);

  const [chargeSettings, setChargeSettings] = useState<ProfitCalculatorSettings>(DEFAULT_PROFIT_CALCULATOR_SETTINGS);
  const [adminRto, setAdminRto] = useState(String(DEFAULT_PROFIT_CALCULATOR_SETTINGS.rtoChargePerOrder));
  const [adminShipping, setAdminShipping] = useState(String(DEFAULT_PROFIT_CALCULATOR_SETTINGS.shippingChargePerOrder));
  const [savingCharges, setSavingCharges] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void profitCalculatorSettingsService
      .getProfitCalculatorSettings()
      .then((s) => {
        if (cancelled) return;
        setChargeSettings(s);
        setAdminRto(String(s.rtoChargePerOrder));
        setAdminShipping(String(s.shippingChargePerOrder));
      })
      .catch(() => {
        if (!cancelled) setChargeSettings(DEFAULT_PROFIT_CALCULATOR_SETTINGS);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setSellingPrice("");
    setExpectedOrders("");
    setConfirmPct("");
    setDeliveryPct("");
    setAdSpend("");
    setMisc("");
    setCalculated(false);
  };

  const result = useMemo(() => {
    if (!calculated || !product) return null;
    return computeProfitCalculator({
      sellingPrice: Number(sellingPrice) || 0,
      expectedOrders: Number(expectedOrders) || 0,
      confirmPct: Number(confirmPct) || 0,
      deliveryPct: Number(deliveryPct) || 0,
      adSpendPerOrder: Number(adSpend) || 0,
      misc: Number(misc) || 0,
      unitCost: getFinalProductPrice(product),
      rtoChargePerOrder: chargeSettings.rtoChargePerOrder,
      shippingChargePerOrder: chargeSettings.shippingChargePerOrder,
    });
  }, [
    calculated,
    sellingPrice,
    expectedOrders,
    confirmPct,
    deliveryPct,
    adSpend,
    misc,
    product,
    chargeSettings,
  ]);

  const handleCalculate = () => {
    const eo = Number(expectedOrders);
    const cp = Number(confirmPct);
    const dp = Number(deliveryPct);
    if (!(eo > 0)) {
      toast.error("Enter expected orders greater than 0");
      return;
    }
    if (cp < 0 || cp > 100 || dp < 0 || dp > 100) {
      toast.error("Confirmation and delivery rates must be between 0 and 100%");
      return;
    }
    setCalculated(true);
  };

  const saveAdminCharges = async () => {
    const rto = Number(adminRto);
    const shipping = Number(adminShipping);
    if (!Number.isFinite(rto) || rto < 0 || !Number.isFinite(shipping) || shipping < 0) {
      toast.error("Charges must be zero or positive numbers");
      return;
    }
    setSavingCharges(true);
    try {
      const saved = await profitCalculatorSettingsService.putProfitCalculatorSettings({
        rtoChargePerOrder: rto,
        shippingChargePerOrder: shipping,
      });
      setChargeSettings(saved);
      setCalculated(false);
      toast.success("Calculator charges updated for all users");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save charges");
    } finally {
      setSavingCharges(false);
    }
  };

  if (!product) return null;
  const isLoss = result != null && result.netProfit < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" /> Profit Calculator
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Estimate margin using confirmation rate, delivery success, sourcing cost, forward shipping, RTO fees, and ad spend.
        </p>

        <div className="rounded-xl bg-muted/40 p-4 flex flex-wrap items-center gap-4">
          <ProductThumbnail
            productId={product.id}
            images={product.images}
            hasImage={product.has_image}
            alt={product.name}
            className="h-16 w-16 rounded-lg object-cover"
            fallbackClassName="h-16 w-16 rounded-lg"
          />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Sourcing cost (App price)</p>
            <p className="font-bold">{formatProductPriceInr(getFinalProductPrice(product))}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Shipping / confirmed order</p>
            <p className="font-bold">₹{chargeSettings.shippingChargePerOrder}</p>
          </div>
          {chargeSettings.rtoChargePerOrder > 0 && (
            <div className="text-sm">
              <p className="text-muted-foreground text-xs">RTO / returned order</p>
              <p className="font-bold">₹{chargeSettings.rtoChargePerOrder}</p>
            </div>
          )}
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Weight</p>
            <p className="font-bold">{product.weight || "500 g"}</p>
          </div>
          <div className="ml-auto flex flex-col gap-2">
            {onPushToShopify && (
              <Button onClick={onPushToShopify} className="bg-primary hover:bg-primary/90">
                Push to Shopify ↗
              </Button>
            )}
            <button
              type="button"
              onClick={reset}
              className="text-sm text-primary flex items-center gap-1 justify-center"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-semibold">Admin — platform charges</p>
            <p className="text-xs text-muted-foreground">
              These rates apply to every dropshipper using the profit calculator.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">RTO charge (₹ / order)</Label>
                <Input type="number" min={0} step={1} value={adminRto} onChange={(e) => setAdminRto(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Shipping charge (₹ / confirmed order)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={adminShipping}
                  onChange={(e) => setAdminShipping(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={savingCharges}
                onClick={() => void saveAdminCharges()}
              >
                <Save className="h-4 w-4" />
                {savingCharges ? "Saving…" : "Save charges"}
              </Button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 mt-1">
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Selling price (₹) *</Label>
              <Input type="number" min={0} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
            </div>
            <div>
              <Label>Expected orders *</Label>
              <Input type="number" min={1} value={expectedOrders} onChange={(e) => setExpectedOrders(e.target.value)} />
            </div>
            <div>
              <Label>Order confirmation rate (%) *</Label>
              <Input type="number" min={0} max={100} value={confirmPct} onChange={(e) => setConfirmPct(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">% of expected orders that confirm for shipping</p>
            </div>
            <div>
              <Label>Delivery success rate (%) *</Label>
              <Input type="number" min={0} max={100} value={deliveryPct} onChange={(e) => setDeliveryPct(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">% of confirmed orders successfully delivered</p>
            </div>
            <div>
              <Label>Ad spend per expected order (₹) *</Label>
              <Input type="number" min={0} value={adSpend} onChange={(e) => setAdSpend(e.target.value)} />
            </div>
            <div>
              <Label>Other misc. costs (₹)</Label>
              <Input type="number" min={0} value={misc} onChange={(e) => setMisc(e.target.value)} />
            </div>
            <Button className="sm:col-span-2 mt-1" onClick={handleCalculate}>
              Calculate profit
            </Button>
          </div>

          <div
            className={`rounded-xl p-4 border-2 space-y-3 ${
              isLoss ? "border-destructive/30 bg-destructive/5" : result ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{isLoss ? "Net loss" : "Net profit"}</p>
                <p className={`font-bold text-lg ${isLoss ? "text-destructive" : "text-primary"}`}>
                  {result ? `₹${Math.abs(result.netProfit).toFixed(0)}` : "—"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Revenue − total costs</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Per delivered order</p>
                <p className={`font-bold ${isLoss ? "text-destructive" : "text-primary"}`}>
                  {result ? `₹${Math.abs(result.netPerDelivered).toFixed(0)}` : "—"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Net ÷ delivered count</p>
            </div>
            {result && (
              <div className="space-y-2 text-xs pt-2 border-t">
                <p className="font-medium text-foreground">Order funnel</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected</span>
                  <span>{result.expectedOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmed</span>
                  <span>{result.confirmed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivered</span>
                  <span>{result.delivered}</span>
                </div>
                {chargeSettings.rtoChargePerOrder > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RTO</span>
                    <span>{result.rto}</span>
                  </div>
                )}
                <p className="font-medium text-foreground pt-1">Revenue</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivered × selling price</span>
                  <span className="text-primary font-medium">₹{result.revenue.toFixed(0)}</span>
                </div>
                <p className="font-medium text-foreground pt-1">Costs</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sourcing ({result.delivered} × app price)</span>
                  <span>₹{result.sourcingCost.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping ({result.confirmed} × ₹{chargeSettings.shippingChargePerOrder})</span>
                  <span>₹{result.shippingCost.toFixed(0)}</span>
                </div>
                {chargeSettings.rtoChargePerOrder > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RTO ({result.rto} × ₹{chargeSettings.rtoChargePerOrder})</span>
                    <span>₹{result.rtoCost.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ad spend</span>
                  <span>₹{result.adCost.toFixed(0)}</span>
                </div>
                {result.miscCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Misc.</span>
                    <span>₹{result.miscCost.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-1 border-t">
                  <span>Total costs</span>
                  <span className="text-destructive">₹{result.totalSpend.toFixed(0)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
