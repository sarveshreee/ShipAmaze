import { Link } from "react-router-dom";
import { Calculator, Star, Package, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";

interface Props {
  product: SupplierProduct;
  onCalculator: (p: SupplierProduct) => void;
  onPush: (p: SupplierProduct) => void;
  priority?: boolean;
  onOpen?: (p: SupplierProduct) => void;
}

function scoreForProduct(product: SupplierProduct) {
  const seed = product.id || product.sku || product.name;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 9;
  return (4 + hash / 10).toFixed(1);
}

export function MarketplaceProductCard({ product, onCalculator, onPush, priority = false, onOpen }: Props) {
  const { role } = useAuth();
  const score = scoreForProduct(product);
  return (
    <div className="group flex flex-col w-[180px] sm:w-[200px] shrink-0" data-marketplace-product-id={product.id}>
      <Link
        to={`/${role}/home/product/${product.id}`}
        onClick={() => onOpen?.(product)}
        className="relative block aspect-square rounded-2xl overflow-hidden bg-muted border hover:shadow-lg transition-shadow"
      >
        <ProductThumbnail
          productId={product.id}
          images={product.images}
          hasImage={product.has_image}
          alt={product.name}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          fallbackClassName="h-full w-full"
        />
        <span className="absolute top-2 left-2 text-[10px] bg-background/90 backdrop-blur px-2 py-0.5 rounded-md font-medium">{product.sku}</span>
        <button onClick={(e) => { e.preventDefault(); onCalculator(product); }} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/90 backdrop-blur flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition" aria-label="Calculator">
          <Calculator className="h-3.5 w-3.5" />
        </button>
      </Link>
      <div className="pt-2 px-1">
        <p className="font-bold text-sm">{formatProductPriceInr(getFinalProductPrice(product))}</p>
        <p className="text-xs text-foreground line-clamp-1 mt-0.5">{product.name}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border"><Package className="h-2.5 w-2.5" />{product.stock}</span>
          <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border"><Star className="h-2.5 w-2.5 text-primary" />{score}/5</span>
        </div>
        <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => onPush(product)}>
          Push to Shopify <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
