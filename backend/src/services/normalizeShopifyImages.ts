/**
 * Canonical Shopify → ShipAmaze product image URL mapping.
 * Used for order line-item enrichment (Shopify does not import into Mongo Product catalog).
 */

export type ShopifyImageLike = {
  id?: number | null;
  src?: string | null;
  url?: string | null;
};

export type ShopifyVariantLike = {
  id?: number | null;
  image_id?: number | null;
};

export type ShopifyProductLike = {
  id?: number | string | null;
  image?: ShopifyImageLike | null;
  images?: ShopifyImageLike[] | null;
  featuredImage?: { url?: string | null; src?: string | null } | null;
  media?: Array<{ preview?: { image?: { url?: string | null } }; image?: { url?: string | null } }> | null;
  variants?: ShopifyVariantLike[] | null;
};

export type ShopifyLineItemLike = {
  product_id?: number | null;
  variant_id?: number | null;
  image?: { src?: string | null; url?: string | null } | null;
  featured_image?: { src?: string | null; url?: string | null } | null;
};

function cleanUrl(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (s === "[object Object]") return undefined;
  // Accept Shopify CDN / https / http / protocol-relative
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return undefined;
}

export function extractShopifyImageSrc(img: ShopifyImageLike | null | undefined): string | undefined {
  if (!img || typeof img !== "object") return undefined;
  return cleanUrl(img.src) ?? cleanUrl(img.url);
}

/** Primary image for a Shopify product (REST or GraphQL-shaped). */
export function productPrimaryImageUrl(product: ShopifyProductLike | undefined | null): string | undefined {
  if (!product) return undefined;
  const direct = extractShopifyImageSrc(product.image ?? undefined);
  if (direct) return direct;
  const featured =
    cleanUrl(product.featuredImage?.url) ??
    cleanUrl(product.featuredImage?.src) ??
    extractShopifyImageSrc(product.featuredImage as ShopifyImageLike | undefined);
  if (featured) return featured;
  for (const img of product.images ?? []) {
    const src = extractShopifyImageSrc(img);
    if (src) return src;
  }
  for (const m of product.media ?? []) {
    const src =
      cleanUrl(m?.preview?.image?.url) ??
      cleanUrl(m?.image?.url);
    if (src) return src;
  }
  return undefined;
}

/**
 * Build productId / variantId → CDN URL map. Idempotent: later calls overwrite with same keys.
 */
export function registerProductImages(
  product: ShopifyProductLike | undefined | null,
  map: Map<string, string>
): void {
  if (!product || product.id == null) return;
  const primary = productPrimaryImageUrl(product);
  if (primary) {
    map.set(String(product.id), primary);
    map.set(`product:${product.id}`, primary);
  }
  const imagesById = new Map<number, string>();
  for (const img of product.images ?? []) {
    const src = extractShopifyImageSrc(img);
    if (src && img.id != null) imagesById.set(Number(img.id), src);
  }
  for (const variant of product.variants ?? []) {
    if (variant?.id == null) continue;
    const imageId = variant.image_id;
    const variantSrc =
      (imageId != null ? imagesById.get(Number(imageId)) : undefined) || primary;
    if (variantSrc) map.set(`variant:${variant.id}`, variantSrc);
  }
}

/**
 * Resolve a single line-item image URL from inline fields + enrichment map.
 */
export function resolveLineItemImageUrl(
  li: ShopifyLineItemLike,
  imageMap?: Map<string, string>
): string | undefined {
  const inline =
    cleanUrl(li.image?.src) ??
    cleanUrl(li.image?.url) ??
    cleanUrl(li.featured_image?.src) ??
    cleanUrl(li.featured_image?.url);
  if (inline) return inline;

  const variantId = li.variant_id;
  if (variantId != null && imageMap?.has(`variant:${variantId}`)) {
    return imageMap.get(`variant:${variantId}`);
  }

  const productId = li.product_id;
  if (productId != null) {
    const productKey = String(productId);
    if (imageMap?.has(productKey)) return imageMap.get(productKey);
    if (imageMap?.has(`product:${productKey}`)) return imageMap.get(`product:${productKey}`);
  }
  return undefined;
}

/**
 * Merge product/line-item arrays without wiping existing imageUrl when the new payload has none.
 * Prevents resync without image map from clearing previously enriched images.
 */
export function mergeLineItemsPreservingImages<T extends { imageUrl?: string | null; sku?: string; name?: string; productName?: string }>(
  incoming: T[] | undefined,
  existing: T[] | undefined
): T[] {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(existing) ? existing : [];
  }
  const prev = Array.isArray(existing) ? existing : [];
  return incoming.map((item, idx) => {
    const newUrl = String(item.imageUrl ?? "").trim();
    if (newUrl) return item;
    const old =
      prev[idx] ||
      prev.find(
        (p) =>
          (p.sku && item.sku && String(p.sku) === String(item.sku)) ||
          (p.name && item.name && String(p.name) === String(item.name)) ||
          (p.productName && item.productName && String(p.productName) === String(item.productName))
      );
    const oldUrl = String(old?.imageUrl ?? "").trim();
    if (!oldUrl) return item;
    return { ...item, imageUrl: oldUrl };
  });
}
