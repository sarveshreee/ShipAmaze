import { apiClient } from "@/lib/apiClient";

const PRODUCT_LIST_CACHE_MS = 60_000;

let productsCache: { rows: unknown[]; cachedAt: number } | null = null;
let productsRequest: Promise<unknown[]> | null = null;
let marketplaceProductsCache: { rows: unknown[]; cachedAt: number } | null = null;
let marketplaceProductsRequest: Promise<unknown[]> | null = null;

function invalidateProductListCache() {
  productsCache = null;
  productsRequest = null;
  marketplaceProductsCache = null;
  marketplaceProductsRequest = null;
}

export async function listProducts() {
  const now = Date.now();
  if (productsCache && now - productsCache.cachedAt < PRODUCT_LIST_CACHE_MS) {
    return productsCache.rows;
  }

  if (!productsRequest) {
    productsRequest = apiClient.get<unknown[]>("/products").then((rows) => {
      productsCache = { rows: Array.isArray(rows) ? rows : [], cachedAt: Date.now() };
      productsRequest = null;
      return productsCache.rows;
    }).catch((error) => {
      productsRequest = null;
      throw error;
    });
  }

  return productsRequest;
}

export async function listMarketplaceProducts() {
  const now = Date.now();
  if (marketplaceProductsCache && now - marketplaceProductsCache.cachedAt < PRODUCT_LIST_CACHE_MS) {
    return marketplaceProductsCache.rows;
  }

  if (!marketplaceProductsRequest) {
    marketplaceProductsRequest = apiClient.get<unknown[]>("/products/marketplace").then((rows) => {
      marketplaceProductsCache = { rows: Array.isArray(rows) ? rows : [], cachedAt: Date.now() };
      marketplaceProductsRequest = null;
      return marketplaceProductsCache.rows;
    }).catch((error) => {
      marketplaceProductsRequest = null;
      throw error;
    });
  }

  return marketplaceProductsRequest;
}

export async function getNextProductSku() {
  return apiClient.get<{ sku: string }>("/products/next-sku");
}

export async function getProductById(id: string) {
  return apiClient.get<unknown>(`/products/detail/${encodeURIComponent(id)}`);
}

const thumbnailCache = new Map<string, ProductImageMeta | null>();
const thumbnailInflight = new Map<string, Promise<ProductImageMeta | null>>();

export type ProductImageMeta = {
  url: string | null;
  thumb?: string | null;
  srcset?: string | null;
  sizes?: string;
  width?: number;
  height?: number;
  blurPlaceholder?: string | null;
};

function thumbnailCacheKey(productId: string, imageIndex = 0): string {
  return `${productId}:${imageIndex}`;
}

export function clearProductImageCache(productId?: string) {
  if (!productId) {
    thumbnailCache.clear();
    thumbnailInflight.clear();
    return;
  }
  for (const key of thumbnailCache.keys()) {
    if (key.startsWith(`${productId}:`)) thumbnailCache.delete(key);
  }
  for (const key of thumbnailInflight.keys()) {
    if (key.startsWith(`${productId}:`)) thumbnailInflight.delete(key);
  }
}

export async function getProductImageMeta(productId: string, imageIndex = 0): Promise<ProductImageMeta | null> {
  const cacheKey = thumbnailCacheKey(productId, imageIndex);
  if (thumbnailCache.has(cacheKey)) return thumbnailCache.get(cacheKey)!;
  const pending = thumbnailInflight.get(cacheKey);
  if (pending) return pending;

  const request = apiClient
    .get<ProductImageMeta>(
      `/products/${encodeURIComponent(productId)}/thumbnail${imageIndex > 0 ? `?index=${imageIndex}` : ""}`
    )
    .then((data) => {
      const meta: ProductImageMeta | null = data?.url && String(data.url).trim()
        ? {
            url: String(data.url),
            thumb: data.thumb ?? null,
            srcset: data.srcset ?? null,
            sizes: data.sizes,
            width: data.width,
            height: data.height,
            blurPlaceholder: data.blurPlaceholder ?? null,
          }
        : null;
      thumbnailCache.set(cacheKey, meta);
      thumbnailInflight.delete(cacheKey);
      return meta;
    })
    .catch(() => {
      thumbnailInflight.delete(cacheKey);
      return null;
    });

  thumbnailInflight.set(cacheKey, request);
  return request;
}

/** @deprecated Use getProductImageMeta */
export async function getProductThumbnail(id: string): Promise<string | null> {
  const meta = await getProductImageMeta(id);
  return meta?.url ?? null;
}

export function preloadProductImages(productIds: string[]): void {
  if (typeof document === "undefined" || productIds.length === 0) return;

  void Promise.all(productIds.map((id) => getProductImageMeta(id))).then((metas) => {
    metas.forEach((meta) => {
      if (!meta?.url) return;
      const href = resolveMediaUrlForPreload(meta.url);
      const srcset = meta.srcset
        ? meta.srcset
            .split(",")
            .map((entry) => {
              const part = entry.trim();
              const space = part.lastIndexOf(" ");
              if (space <= 0) return resolveMediaUrlForPreload(part) ?? part;
              const url = part.slice(0, space);
              const descriptor = part.slice(space + 1);
              const resolved = resolveMediaUrlForPreload(url);
              return resolved ? `${resolved} ${descriptor}` : part;
            })
            .join(", ")
        : undefined;
      if (!href) return;

      const existing = document.head.querySelector(`link[data-preload-image="${href}"]`);
      if (existing) return;

      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      link.setAttribute("data-preload-image", href);
      if (srcset) {
        link.setAttribute("imagesrcset", srcset);
        if (meta.sizes) link.setAttribute("imagesizes", meta.sizes);
      }
      document.head.appendChild(link);
    });
  });
}

function resolveMediaUrlForPreload(path: string): string | null {
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = envBase ? envBase.replace(/\/$/, "") : import.meta.env.DEV ? "/api" : "";
  const apiBase = /\/api$/i.test(normalized) ? normalized : normalized ? `${normalized}/api` : "";
  return apiBase ? `${apiBase}${path.startsWith("/") ? path : `/${path}`}` : path;
}

export async function listProductsForExport() {
  return apiClient.get<unknown[]>("/products?includeDescriptions=1");
}

export async function getProductVariants(id: string) {
  return apiClient.get<unknown[]>(`/products/${encodeURIComponent(id)}/variants`);
}

export async function createProduct(body: Record<string, unknown>) {
  const result = await apiClient.post<unknown>("/products", body);
  invalidateProductListCache();
  return result;
}

export async function updateProduct(id: string, body: Record<string, unknown>) {
  const result = await apiClient.put<unknown>(`/products/${encodeURIComponent(id)}`, body);
  invalidateProductListCache();
  clearProductImageCache(id);
  return result;
}

export async function deleteProduct(id: string) {
  const result = await apiClient.delete<{ ok: boolean }>(`/products/${encodeURIComponent(id)}`);
  invalidateProductListCache();
  return result;
}

export async function listProductRequests() {
  return apiClient.get<unknown[]>("/product-requests");
}

export async function createProductRequest(body: Record<string, unknown>) {
  return apiClient.post<unknown>("/product-requests", body);
}

export async function updateProductRequest(id: string, body: Record<string, unknown>) {
  return apiClient.put<unknown>(`/product-requests/${encodeURIComponent(id)}`, body);
}

export async function deleteProductRequest(id: string) {
  return apiClient.delete(`/product-requests/${encodeURIComponent(id)}`);
}
