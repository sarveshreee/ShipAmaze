import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, RotateCcw } from "lucide-react";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: SupplierProduct | null;
  onPushToShopify?: () => void;
}

const RTO_PER_KG = 70;

export function ProfitCalculatorModal({ open, onOpenChange, product, onPushToShopify }: Props) {
  const [sellingPrice, setSellingPrice] = useState("");
  const [expectedOrders, setExpectedOrders] = useState("");
  const [confirmPct, setConfirmPct] = useState("");
  const [deliveryPct, setDeliveryPct] = useState("");
  const [adSpend, setAdSpend] = useState("");
  const [misc, setMisc] = useState("");
  const [calculated, setCalculated] = useState(false);

  const reset = () => {
    setSellingPrice(""); setExpectedOrders(""); setConfirmPct("");
    setDeliveryPct(""); setAdSpend(""); setMisc(""); setCalculated(false);
  };

  const result = useMemo(() => {
    if (!calculated || !product) return null;
    const sp = Number(sellingPrice) || 0;
    const eo = Number(expectedOrders) || 0;
    const cp = (Number(confirmPct) || 0) / 100;
    const dp = (Number(deliveryPct) || 0) / 100;
    const ad = Number(adSpend) || 0;
    const m = Number(misc) || 0;

    const confirmed = Math.round(eo * cp);
    const delivered = Math.round(confirmed * dp);
    const rto = confirmed - delivered;
    const earnings = delivered * sp;
    const productCost = confirmed * product.price;
    const rtoCharges = rto * RTO_PER_KG;
    const adCost = eo * ad;
    const totalSpend = productCost + rtoCharges + adCost + m;
    const net = earnings - totalSpend;
    const perOrder = delivered > 0 ? net / delivered : 0;
    return { confirmed, delivered, rto, earnings, productCost, rtoCharges, adCost, totalSpend, net, perOrder };
  }, [calculated, sellingPrice, expectedOrders, confirmPct, deliveryPct, adSpend, misc, product]);

  if (!product) return null;
  const isLoss = result && result.net < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Profit Calculator</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl bg-muted/40 p-4 flex flex-wrap items-center gap-4">
          <img src={product.images[0] || "/placeholder.svg"} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">App Price</p>
            <p className="font-bold">₹ {product.price}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">RTO Charges</p>
            <p className="font-bold">₹ {RTO_PER_KG}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Weight</p>
            <p className="font-bold">{product.weight || "500 g"}</p>
          </div>
          <div className="ml-auto flex flex-col gap-2">
            {onPushToShopify && (
              <Button onClick={onPushToShopify} className="bg-primary hover:bg-primary/90">Push to Shopify ↗</Button>
            )}
            <button onClick={reset} className="text-sm text-primary flex items-center gap-1 justify-center"><RotateCcw className="h-3 w-3" /> Reset</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-2">
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div><Label>Selling Price (₹)*</Label><Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} /></div>
            <div><Label>Expected Orders*</Label><Input type="number" value={expectedOrders} onChange={e => setExpectedOrders(e.target.value)} /></div>
            <div><Label>Confirm Orders (%)*</Label><Input type="number" value={confirmPct} onChange={e => setConfirmPct(e.target.value)} /></div>
            <div><Label>Expected Delivery (%)*</Label><Input type="number" value={deliveryPct} onChange={e => setDeliveryPct(e.target.value)} /></div>
            <div><Label>Ad Spends per order (₹)*</Label><Input type="number" value={adSpend} onChange={e => setAdSpend(e.target.value)} /></div>
            <div><Label>Total Misc. Charges (₹)</Label><Input type="number" value={misc} onChange={e => setMisc(e.target.value)} /></div>
            <Button className="col-span-2 mt-2" variant="outline" onClick={() => setCalculated(true)}>Calculate</Button>
          </div>

          <div className={`rounded-xl p-4 border-2 space-y-3 ${isLoss ? "border-destructive/30 bg-destructive/5" : result ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{isLoss ? "Net Loss" : "Net Profit"}</p>
                <p className={`font-bold ${isLoss ? "text-destructive" : "text-primary"}`}>{result ? `₹${Math.abs(result.net).toFixed(0)}` : "₹N/A"}</p>
              </div>
              <p className="text-xs text-muted-foreground">Total Earnings - Total Spends</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{isLoss ? "Net Loss" : "Net Profit"} (Per Order)</p>
                <p className={`font-bold ${isLoss ? "text-destructive" : "text-primary"}`}>{result ? `₹${Math.abs(result.perOrder).toFixed(0)}` : "₹N/A"}</p>
              </div>
              <p className="text-xs text-muted-foreground">Net / Delivered orders</p>
            </div>
            {result && (
              <div className="space-y-1.5 text-xs pt-2 border-t">
                <div className="flex justify-between"><span className="text-muted-foreground">Confirmed</span><span>{result.confirmed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Delivered</span><span>{result.delivered}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">RTO</span><span>{result.rto}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Earnings</span><span className="text-primary">₹{result.earnings.toFixed(0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Spends</span><span className="text-destructive">₹{result.totalSpend.toFixed(0)}</span></div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
