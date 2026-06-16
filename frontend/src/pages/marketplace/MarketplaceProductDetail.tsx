import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calculator, Star, Package, Weight, ChevronDown, ShieldCheck, Truck, Banknote, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketplaceProduct } from "@/hooks/useMarketplace";
import { ProfitCalculatorModal } from "@/components/marketplace/ProfitCalculatorModal";
import { ShopifyPushDrawer } from "@/components/marketplace/ShopifyPushDrawer";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";

export default function MarketplaceProductDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { product, isLoading } = useMarketplaceProduct(id);
  const [activeImg, setActiveImg] = useState(0);
  const [calc, setCalc] = useState(false);
  const [push, setPush] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);

  if (isLoading) return <p className="text-center text-muted-foreground py-12">Loading...</p>;
  if (!product) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground mb-4">Product not found</p>
      <Button onClick={() => navigate(`/${role}/home`)}>Back to Marketplace</Button>
    </div>
  );

  const images = product.images.length ? product.images : ["/placeholder.svg"];
  const score = (4 + Math.random() * 0.9).toFixed(1);

  return (
    <div className="space-y-6">
      <Link to={`/${role}/home`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to marketplace
      </Link>

      <div className="grid md:grid-cols-[100px_1fr_1fr] gap-4 lg:gap-6 bg-card rounded-2xl border p-4 lg:p-6">
        {/* Thumbnails */}
        <div className="hidden md:flex flex-col gap-2 max-h-[500px] overflow-y-auto">
          {images.map((src, i) => (
            <button key={i} onClick={() => setActiveImg(i)} className={`h-20 w-20 rounded-lg overflow-hidden border-2 ${activeImg === i ? "border-primary" : "border-transparent"}`}>
              <img src={src} alt={`thumb ${i}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {/* Main image */}
        <div className="aspect-square rounded-xl overflow-hidden bg-muted">
          <img src={images[activeImg]} alt={product.name} className="h-full w-full object-cover" />
        </div>

        {/* Info */}
        <div className="space-y-4">
          <h1 className="text-xl md:text-2xl font-bold leading-tight">{product.name}</h1>

          <div className="flex items-center gap-3">
            <p className="text-3xl font-bold">{formatProductPriceInr(getFinalProductPrice(product))}</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setCalc(true)}>
              Calculator <Calculator className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1"><Package className="h-3 w-3" /> Inventory: {product.stock}</Badge>
            <Badge variant="outline" className="gap-1"><Star className="h-3 w-3 text-primary" /> Supplier Score: {score}/5</Badge>
            <Badge variant="outline" className="gap-1"><Weight className="h-3 w-3" /> Weight: {product.weight || "500 gms"}</Badge>
            <Badge variant="outline" className="gap-1">SA: {product.sku}</Badge>
          </div>

          <Button className="w-full h-12 text-base" onClick={() => setPush(true)}>
            Push to Shopify <ExternalLink className="ml-2 h-4 w-4" />
          </Button>

          {product.category && <Badge variant="secondary" className="rounded-full">{product.category}</Badge>}

          <Collapsible open={chargesOpen} onOpenChange={setChargesOpen} className="border rounded-xl bg-muted/30">
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-sm">
              <span>↘ RTO & RVP charges are applicable and vary depending on Product weight. <span className="underline text-primary">View Charges</span></span>
              <ChevronDown className={`h-4 w-4 transition ${chargesOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 text-xs space-y-1 text-muted-foreground">
              <p>• RTO charge: ~₹70 per shipment (varies by weight)</p>
              <p>• RVP charge: applicable when buyer initiates return</p>
              <p>• COD handling: 1.5% of order value</p>
            </CollapsibleContent>
          </Collapsible>

          <div>
            <p className="font-semibold text-sm mb-2">Variants</p>
            <div className="flex gap-2">
              <div className="h-20 w-20 rounded-lg overflow-hidden border-2 border-primary">
                <img src={images[0]} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Assurance */}
      <div className="bg-card rounded-2xl border p-6">
        <h3 className="font-bold mb-4">ShipAmaze Assurance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: ShieldCheck, label: "Quality Assured Products", color: "text-amber-600 bg-amber-100" },
            { icon: Truck, label: "Free Shipping", color: "text-slate-600 bg-slate-100" },
            { icon: Banknote, label: "Cash On Delivery", color: "text-green-600 bg-green-100" },
            { icon: RefreshCw, label: "5 Days Easy Return", color: "text-blue-600 bg-blue-100" },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="h-5 w-5" /></div>
              <p className="text-sm font-medium">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Highlights */}
      <div className="bg-card rounded-2xl border p-6 space-y-4">
        <h3 className="text-lg font-bold text-green-600">Highlights</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {product.long_description || product.short_description || `${product.name} — premium quality, sourced from verified suppliers. Backed by ShipAmaze assurance.`}
        </p>
        {product.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {product.tags.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm pt-2 border-t">
          <div><p className="text-muted-foreground text-xs">SKU</p><p className="font-medium">{product.sku}</p></div>
          <div><p className="text-muted-foreground text-xs">Category</p><p className="font-medium">{product.category || "—"}</p></div>
          <div><p className="text-muted-foreground text-xs">Brand</p><p className="font-medium">{product.brand || "ShipAmaze"}</p></div>
          <div><p className="text-muted-foreground text-xs">Weight</p><p className="font-medium">{product.weight || "500g"}</p></div>
          <div><p className="text-muted-foreground text-xs">HSN</p><p className="font-medium">{product.hsn || "—"}</p></div>
          <div><p className="text-muted-foreground text-xs">Origin</p><p className="font-medium">{product.country_of_origin}</p></div>
        </div>
      </div>

      <ProfitCalculatorModal open={calc} onOpenChange={setCalc} product={product} onPushToShopify={() => { setCalc(false); setPush(true); }} />
      <ShopifyPushDrawer open={push} onOpenChange={setPush} product={product} />
    </div>
  );
}
