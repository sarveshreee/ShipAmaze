import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as productService from "@/services/productService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Truck, RefreshCw, Star, Minus, Plus, ShoppingCart, ArrowLeft, Copy, Edit, PackageCheck, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFinalProductPrice, getFinalVariantPrice, formatProductPriceInr } from "@/lib/pricing";
import { productImageDisplayUrl, type ProductImageValue } from "@/lib/mediaUrl";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PreviewVariant extends Record<string, unknown> {
  id?: string;
  _id?: string;
  option1_name?: string; option1_value?: string;
  option2_name?: string; option2_value?: string;
  sku?: string; price?: number; stock?: number; image?: ProductImageValue;
  status?: string;
  our_commission?: number;
  ourCommission?: number;
}

interface PreviewProduct extends Record<string, unknown> {
  id?: string;
  name: string;
  sku?: string;
  brand?: string;
  category?: string;
  short_description?: string;
  long_description?: string;
  price?: number;
  selling_price?: number;
  shipping_charge?: number;
  our_commission?: number;
  stock?: number;
  status?: string;
  min_order_qty?: number;
  tags?: string[];
  images: ProductImageValue[];
  has_image?: boolean;
  primary_image_index?: number;
  weight?: string;
  hsn?: string;
  cod_available?: boolean;
  returnable?: boolean;
  warranty?: string;
  manufacturer?: string;
  country_of_origin?: string;
  care_instructions?: string;
  gst_percent?: number;
  variants?: PreviewVariant[];
}

export default function ProductPreview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAuth();
  const id = params.get("id");
  const [product, setProduct] = useState<PreviewProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [opt1, setOpt1] = useState<string>("");
  const [opt2, setOpt2] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<"cart" | "buy" | null>(null);

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
              id: String(p._id ?? p.id ?? id),
              name: String(p.name ?? ""),
              sku: p.sku as string | undefined,
              brand: (p.brand as string) || undefined,
              category: (p.category as string) || undefined,
              short_description: (p.shortDescription ?? p.short_description) as string | undefined,
              long_description: (p.longDescription ?? p.long_description) as string | undefined,
              price: mrp,
              selling_price: selling || mrp,
              shipping_charge: Number(p.shippingCharge ?? p.shipping_charge ?? p.shippingCharges ?? 0),
              our_commission: Number(p.ourCommission ?? p.our_commission ?? p.commission ?? 40),
              stock: Number(p.stock ?? 0),
              status: String(p.status ?? ""),
              min_order_qty: Number(p.minOrderQty ?? p.min_order_qty ?? 1),
              tags: (Array.isArray(p.tags) ? p.tags : []) as string[],
              images: Array.isArray(p.images) ? (p.images as ProductImageValue[]) : [],
              has_image: Boolean(p.hasImage ?? p.has_image ?? (Array.isArray(p.images) && p.images.length > 0)),
              primary_image_index: Number(p.primaryImageIndex ?? p.primary_image_index ?? 0),
              weight: p.weight as string | undefined,
              hsn: p.hsn as string | undefined,
              cod_available: Boolean(p.codAvailable ?? p.cod_available),
              returnable: Boolean(p.returnable),
              warranty: p.warranty as string | undefined,
              manufacturer: p.manufacturer as string | undefined,
              country_of_origin: (p.countryOfOrigin ?? p.country_of_origin) as string | undefined,
              care_instructions: (p.careInstructions ?? p.care_instructions) as string | undefined,
              gst_percent: Number(p.gstPercent ?? p.gst_percent ?? 0),
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

  const availableVariants = useMemo(
    () => (product?.variants ?? []).filter(v => v.status !== "inactive"),
    [product?.variants]
  );

  const opt1Values = useMemo(() => {
    if (!availableVariants.length) return [];
    const set = new Set<string>();
    availableVariants.forEach(v => v.option1_value && set.add(v.option1_value));
    return Array.from(set);
  }, [availableVariants]);

  const opt2Values = useMemo(() => {
    if (!availableVariants.length) return [];
    const set = new Set<string>();
    availableVariants
      .filter(v => !opt1 || !v.option1_value || v.option1_value === opt1)
      .forEach(v => v.option2_value && set.add(v.option2_value));
    return Array.from(set);
  }, [availableVariants, opt1]);

  const opt1Name = availableVariants.find(v => v.option1_name)?.option1_name || "Option";
  const opt2Name = availableVariants.find(v => v.option2_name)?.option2_name || "Option";

  useEffect(() => {
    if (!opt1Values.length) return;
    setOpt1(current => current || opt1Values[0]);
  }, [opt1Values]);

  useEffect(() => {
    if (!opt2Values.length) {
      setOpt2("");
      return;
    }
    setOpt2(current => (current && opt2Values.includes(current) ? current : opt2Values[0]));
  }, [opt2Values]);

  const selectedVariant = useMemo(() => {
    if (!availableVariants.length) return null;
    return availableVariants.find(v => {
      const matchOpt1 = !opt1Values.length || !v.option1_value || v.option1_value === opt1;
      const matchOpt2 = !opt2Values.length || !v.option2_value || v.option2_value === opt2;
      return matchOpt1 && matchOpt2;
    }) ?? availableVariants[0];
  }, [availableVariants, opt1, opt1Values.length, opt2, opt2Values.length]);

  const productId = product?.id ?? id ?? "";
  const variantStock = selectedVariant?.stock;
  const availableStock = Number(variantStock ?? product?.stock ?? 0);
  const inStock = availableStock > 0;
  const displayPrice = selectedVariant ? getFinalVariantPrice(selectedVariant, product ?? undefined) : getFinalProductPrice(product ?? {});
  const listMrp = product?.selling_price && product.selling_price > displayPrice ? product.selling_price : null;
  const discount = listMrp ? Math.round(((listMrp - displayPrice) / listMrp) * 100) : 0;

  useEffect(() => {
    if (availableStock > 0) setQty(current => Math.min(current, availableStock));
  }, [availableStock]);

  const copyPreviewLink = async () => {
    const url = productId ? `${window.location.origin}/product-preview?id=${encodeURIComponent(productId)}` : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Preview link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const selectedOrderItem = () => {
    if (!product) return null;
    return {
      id: productId,
      variantId: selectedVariant?._id ?? selectedVariant?.id ?? null,
      name: product.name,
      sku: selectedVariant?.sku || product.sku || "",
      qty,
      price: displayPrice,
      weight: product.weight || "",
      options: [opt1, opt2].filter(Boolean).join(" / "),
    };
  };

  const addToOrderDraft = () => {
    const item = selectedOrderItem();
    if (!item) return;
    if (!inStock) {
      toast.error("This product is out of stock");
      return;
    }
    setActionLoading("cart");
    try {
      const existingRaw = localStorage.getItem("shipamaze_order_draft_items");
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = Array.isArray(existing) ? existing.filter((row: { id?: string; variantId?: string | null }) => row.id !== item.id || row.variantId !== item.variantId) : [];
      next.push(item);
      localStorage.setItem("shipamaze_order_draft_items", JSON.stringify(next));
      toast.success("Added to order draft", { description: "Use Buy Now to continue with this product." });
    } catch {
      toast.error("Could not save order draft");
    } finally {
      setActionLoading(null);
    }
  };

  const buyNow = () => {
    const item = selectedOrderItem();
    if (!item) return;
    if (!inStock) {
      toast.error("This product is out of stock");
      return;
    }
    setActionLoading("buy");
    localStorage.setItem("shipamaze_order_draft_items", JSON.stringify([item]));
    navigate(`/${role}/create-order?product=${encodeURIComponent(productId)}&qty=${qty}`);
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(`/${role}/products`);
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner */}
      <div className="bg-warning/15 border-b border-warning/30 py-2 px-4 text-center text-xs font-medium text-warning-dark">
        Preview mode - review the product page before selling or sharing it.
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyPreviewLink}>
              <Share2 className="mr-2 h-4 w-4" /> Copy link
            </Button>
            {isAuthenticated && role !== "dropshipper" && productId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/${role}/source-product?id=${encodeURIComponent(productId)}`)}>
                <Edit className="mr-2 h-4 w-4" /> Edit product
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <section>
            <div className="aspect-square rounded-2xl bg-card shadow-card overflow-hidden border border-border flex items-center justify-center">
              {product.images?.[activeImage] || product.has_image ? (
                <ProductThumbnail
                  productId={productId}
                  images={product.images?.[activeImage] ? [product.images[activeImage]] : undefined}
                  hasImage={product.has_image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  fallbackClassName="w-full h-full"
                  imageIndex={activeImage}
                  loading="eager"
                  fetchPriority="high"
                  variant="detail"
                />
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
                    <img src={productImageDisplayUrl(src, { width: 250 }) ?? ""} alt={`${product.name} thumbnail ${i + 1}`} className="w-full h-full object-cover" />
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {product.category && <Badge variant="outline">{product.category}</Badge>}
                {product.status && <Badge className={product.status === "active" ? "bg-success-light text-success-dark hover:bg-success-light" : "bg-surface-2 text-text-secondary hover:bg-surface-2"}>{product.status}</Badge>}
                <Badge variant="outline">SKU: {selectedVariant?.sku || product.sku || "N/A"}</Badge>
              </div>
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Available stock" value={inStock ? availableStock : "Out"} tone={inStock ? "success" : "danger"} />
              <Metric label="Min order" value={product.min_order_qty ?? 1} />
              <Metric label="COD" value={product.cod_available ? "Yes" : "No"} />
              <Metric label="Returnable" value={product.returnable ? "Yes" : "No"} />
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
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center rounded-lg border border-border">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="p-2 hover:bg-surface-2" disabled={!inStock}><Minus className="h-4 w-4" /></button>
                <span className="px-4 text-sm font-medium w-10 text-center">{qty}</span>
                <button onClick={() => setQty(q => availableStock > 0 ? Math.min(availableStock, q + 1) : q + 1)} className="p-2 hover:bg-surface-2" disabled={!inStock}><Plus className="h-4 w-4" /></button>
              </div>
              {role === "dropshipper" ? (
                <>
                  <Button className="flex-1" disabled={!inStock || actionLoading !== null} onClick={addToOrderDraft}>
                    {actionLoading === "cart" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
                    Add to Order
                  </Button>
                  <Button variant="outline" className="flex-1" disabled={!inStock || actionLoading !== null} onClick={buyNow}>
                    {actionLoading === "buy" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                    Buy Now
                  </Button>
                </>
              ) : (
                <>
                  <Button className="flex-1" onClick={copyPreviewLink}><Copy className="h-4 w-4 mr-2" />Share Preview</Button>
                  {productId && <Button variant="outline" className="flex-1" onClick={() => navigate(`/${role}/source-product?id=${encodeURIComponent(productId)}`)}><Edit className="h-4 w-4 mr-2" />Edit Product</Button>}
                </>
              )}
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
              {product.hsn && <div className="flex justify-between gap-3"><dt className="text-text-muted">GST</dt><dd className="text-text-primary font-medium">{product.gst_percent ?? 0}%</dd></div>}
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold text-text-primary", tone === "success" && "text-success-dark", tone === "danger" && "text-danger")}>
        {value}
      </p>
    </div>
  );
}
