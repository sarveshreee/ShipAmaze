import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; product: SupplierProduct | null; }

const MOCK_STORES = [
  { id: "s1", name: "My Demo Store", platform: "Shopify" },
  { id: "s2", name: "FashionHub Store", platform: "Shopify" },
];

export function ShopifyPushDrawer({ open, onOpenChange, product }: Props) {
  const [storeId, setStoreId] = useState(MOCK_STORES[0].id);
  const [sellingPrice, setSellingPrice] = useState("");
  const [pushing, setPushing] = useState(false);

  const margin = useMemo(() => {
    const sp = Number(sellingPrice) || 0;
    if (!product || !sp) return null;
    const profit = sp - product.price;
    const pct = product.price > 0 ? (profit / product.price) * 100 : 0;
    return { profit, pct };
  }, [sellingPrice, product]);

  const handlePush = async () => {
    if (!sellingPrice || Number(sellingPrice) <= 0) { toast.error("Enter a valid selling price"); return; }
    setPushing(true);
    await new Promise(r => setTimeout(r, 900));
    setPushing(false);
    toast.success(`Pushed to ${MOCK_STORES.find(s => s.id === storeId)?.name}!`);
    onOpenChange(false);
    setSellingPrice("");
  };

  if (!product) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Push to Shopify</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="flex gap-3 p-3 rounded-xl bg-muted/40">
            <img src={product.images[0] || "/placeholder.svg"} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="font-medium truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.sku}</p>
              <p className="text-sm font-semibold mt-1">₹{product.price}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Select store</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOCK_STORES.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Your selling price (₹)</Label>
            <Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="e.g. 599" />
          </div>

          {margin && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span>₹{product.price}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Profit / order</span><span className={margin.profit >= 0 ? "text-primary font-medium" : "text-destructive font-medium"}>₹{margin.profit.toFixed(0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span className={margin.pct >= 0 ? "text-primary font-medium" : "text-destructive font-medium"}>{margin.pct.toFixed(1)}%</span></div>
            </div>
          )}

          <div className="text-xs text-muted-foreground border rounded-lg p-2 bg-muted/30">
            ⓘ RTO & RVP charges apply based on weight ({product.weight || "500g"}). Final payouts will reflect after delivery.
          </div>

          <Button onClick={handlePush} disabled={pushing} className="w-full">
            {pushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Push to Shopify
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
