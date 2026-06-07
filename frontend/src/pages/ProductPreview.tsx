import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as productService from "@/services/productService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Truck, RefreshCw, Star, Minus, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";

interface PreviewVariant {
  option1_name?: string; option1_value?: string;
  option2_name?: string; option2_value?: string;
  sku?: string; price?: number; stock?: number; image?: string;
}

interface PreviewProduct {
  name: string;
  sku?: string;
  brand?: string;
  category?: string;
  short_description?: string;
  long_description?: string;
  price?: number;
  selling_price?: number;
  shipping_charge?: number;
  stock?: number;
  tags?: string[];
  images: string[];
  primary_image_index?: number;
  weight?: string;
  hsn?: string;
  cod_available?: boolean;
  returnable?: boolean;
  warranty?: string;
  manufacturer?: string;
  country_of_origin?: string;
  care_instructions?: string;
  variants?: PreviewVariant[];
}

export default function ProductPreview() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const [product, setProduct] = useState<PreviewProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [opt1, setOpt1] = useState<string>("");
  const [opt2, setOpt2] = useState<string>("");

  useEffect(() => {
    document.title = "Product Preview";
    (async () => {
      setLoading(true);
      try {
        if (id) {
          const p = (await productService.getProductById(id)) as Record<string, unknown>;
          if (p && Object.keys(p).length) {
            const vs = (await productService.getProductVariants(id)) as unknown[];
            const selling = Number(p.sellingPrice ?? p.selling_price ?? 0);
            const mrp = Number(p.price ?? 0);
            setProduct({
              name: String(p.name ?? ""),
              sku: p.sku as string | undefined,
              brand: (p.brand as string) || undefined,
              category: (p.category as string) || undefined,
              short_description: (p.shortDescription ?? p.short_description) as string | undefined,
              long_description: (p.longDescription ?? p.long_description) as string | undefined,
              price: mrp,
              selling_price: selling || mrp,
              shipping_charge: Number(p.shippingCharge ?? p.shipping_charge ?? p.shippingCharges ?? 0),
              stock: Number(p.stock ?? 0),
              tags: (Array.isArray(p.tags) ? p.tags : []) as string[],
              images: Array.isArray(p.images) ? (p.images as string[]) : [],
              primary_image_index: Number(p.primaryImageIndex ?? p.primary_image_index ?? 0),
              weight: p.weight as string | undefined,
              hsn: p.hsn as string | undefined,
              cod_available: Boolean(p.codAvailable ?? p.cod_available),
              returnable: Boolean(p.returnable),
              warranty: p.warranty as string | undefined,
              manufacturer: p.manufacturer as string | undefined,
              country_of_origin: (p.countryOfOrigin ?? p.country_of_origin) as string | undefined,
              care_instructions: (p.careInstructions ?? p.care_instructions) as string | undefined,
              variants: (Array.isArray(vs) ? vs : []) as PreviewVariant[],
            });
          }
        } else {
          const raw = sessionStorage.getItem("product_preview");
          if (raw) setProduct(JSON.parse(raw));
        }
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const primary = product?.primary_image_index ?? 0;
  useEffect(() => { if (product) setActiveImage(primary); }, [product, primary]);

  const opt1Values = useMemo(() => {
    if (!product?.variants?.length) return [];
    const set = new Set<string>();
    product.variants.forEach(v => v.option1_value && set.add(v.option1_value));
    return Array.from(set);
  }, [product]);
  const opt2Values = useMemo(() => {
    if (!product?.variants?.length) return [];
    const set = new Set<string>();
    product.variants.forEach(v => v.option2_value && set.add(v.option2_value));
    return Array.from(set);
  }, [product]);
  const opt1Name = product?.variants?.find(v => v.option1_name)?.option1_name;
  const opt2Name = product?.variants?.find(v => v.option2_name)?.option2_name;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-2 text-center px-4">
        <h1 className="text-xl font-semibold text-text-primary">No preview available</h1>
        <p className="text-sm text-text-muted">Open this page from the Source A Product wizard or via a product link.</p>
      </div>
    );
  }

  const displayPrice = getFinalProductPrice(product);
  const listMrp = product.selling_price && product.selling_price > displayPrice ? product.selling_price : null;
  const discount = listMrp ? Math.round(((listMrp - displayPrice) / listMrp) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner */}
      <div className="bg-warning/15 border-b border-warning/30 py-2 px-4 text-center text-xs font-medium text-warning-dark">
        🔍 Preview mode — this is how customers will see your product
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <section>
            <div className="aspect-square rounded-2xl bg-card shadow-card overflow-hidden border border-border flex items-center justify-center">
              {product.images?.[activeImage] ? (
                <img src={product.images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-text-muted text-sm">No image</div>
              )}
            </div>
            {product.images?.length > 1 && (
              <div className="mt-3 grid grid-cols-6 gap-2">
                {product.images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "aspect-square rounded-lg overflow-hidden border-2 transition-colors",
                      activeImage === i ? "border-primary" : "border-border hover:border-primary/50"
                    )}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Info */}
          <section className="space-y-5">
            <div>
              {product.brand && <p className="text-xs uppercase tracking-wide text-text-muted font-medium">{product.brand}</p>}
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary mt-1">{product.name}</h1>
              {product.category && <p className="text-sm text-text-muted mt-1">{product.category}</p>}
            </div>

            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-warning text-warning" />)}
              <span className="text-xs text-text-muted ml-2">(Sample reviews)</span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-text-primary">{formatProductPriceInr(displayPrice)}</span>
              {listMrp && (
                <>
                  <span className="text-base text-text-muted line-through">{formatProductPriceInr(listMrp)}</span>
                  <Badge className="bg-success-light text-success-dark hover:bg-success-light">{discount}% OFF</Badge>
                </>
              )}
            </div>

            {product.short_description && <p className="text-sm text-text-secondary">{product.short_description}</p>}

            {/* Variants */}
            {opt1Values.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">{opt1Name}: <span className="text-text-secondary">{opt1 || "Select"}</span></p>
                <div className="flex flex-wrap gap-2">
                  {opt1Values.map(v => (
                    <button key={v} onClick={() => setOpt1(v)} className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                      opt1 === v ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"
                    )}>{v}</button>
                  ))}
                </div>
              </div>
            )}
            {opt2Values.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">{opt2Name}: <span className="text-text-secondary">{opt2 || "Select"}</span></p>
                <div className="flex flex-wrap gap-2">
                  {opt2Values.map(v => (
                    <button key={v} onClick={() => setOpt2(v)} className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                      opt2 === v ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"
                    )}>{v}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Qty + CTA */}
            <div className="flex items-center gap-3 pt-2">
              <div className="inline-flex items-center rounded-lg border border-border">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="p-2 hover:bg-surface-2"><Minus className="h-4 w-4" /></button>
                <span className="px-4 text-sm font-medium w-10 text-center">{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="p-2 hover:bg-surface-2"><Plus className="h-4 w-4" /></button>
              </div>
              <Button className="flex-1" disabled><ShoppingCart className="h-4 w-4 mr-2" />Add to Cart</Button>
              <Button variant="outline" className="flex-1" disabled>Buy Now</Button>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {product.cod_available && (
                <div className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2">
                  <Truck className="h-5 w-5 text-primary mb-1" />
                  <span className="text-[11px] font-medium text-text-secondary">COD Available</span>
                </div>
              )}
              {product.returnable && (
                <div className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2">
                  <RefreshCw className="h-5 w-5 text-primary mb-1" />
                  <span className="text-[11px] font-medium text-text-secondary">Easy Returns</span>
                </div>
              )}
              {product.warranty && (
                <div className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2">
                  <ShieldCheck className="h-5 w-5 text-primary mb-1" />
                  <span className="text-[11px] font-medium text-text-secondary">{product.warranty}</span>
                </div>
              )}
            </div>

            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {product.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              </div>
            )}
          </section>
        </div>

        {/* Description + specs */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {product.long_description && (
            <div className="lg:col-span-2 rounded-xl bg-card shadow-card p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-3">Product Description</h2>
              <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{product.long_description}</p>
              {product.care_instructions && (
                <>
                  <h3 className="text-sm font-semibold text-text-primary mt-5 mb-2">Care Instructions</h3>
                  <p className="text-sm text-text-secondary whitespace-pre-line">{product.care_instructions}</p>
                </>
              )}
            </div>
          )}
          <div className="rounded-xl bg-card shadow-card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-3">Specifications</h2>
            <dl className="space-y-2 text-sm">
              {product.sku && <div className="flex justify-between gap-3"><dt className="text-text-muted">SKU</dt><dd className="text-text-primary font-medium">{product.sku}</dd></div>}
              {product.brand && <div className="flex justify-between gap-3"><dt className="text-text-muted">Brand</dt><dd className="text-text-primary font-medium">{product.brand}</dd></div>}
              {product.category && <div className="flex justify-between gap-3"><dt className="text-text-muted">Category</dt><dd className="text-text-primary font-medium">{product.category}</dd></div>}
              {product.weight && <div className="flex justify-between gap-3"><dt className="text-text-muted">Weight</dt><dd className="text-text-primary font-medium">{product.weight}</dd></div>}
              {product.hsn && <div className="flex justify-between gap-3"><dt className="text-text-muted">HSN</dt><dd className="text-text-primary font-medium">{product.hsn}</dd></div>}
              {product.country_of_origin && <div className="flex justify-between gap-3"><dt className="text-text-muted">Country of Origin</dt><dd className="text-text-primary font-medium">{product.country_of_origin}</dd></div>}
              {product.manufacturer && <div className="flex justify-between gap-3"><dt className="text-text-muted">Manufacturer</dt><dd className="text-text-primary font-medium">{product.manufacturer}</dd></div>}
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
