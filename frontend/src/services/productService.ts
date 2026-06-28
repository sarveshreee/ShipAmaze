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

const thumbnailCache = new Map<string, string | null>();
const thumbnailInflight = new Map<string, Promise<string | null>>();

export async function getProductThumbnail(id: string): Promise<string | null> {
  if (thumbnailCache.has(id)) return thumbnailCache.get(id)!;
  const pending = thumbnailInflight.get(id);
  if (pending) return pending;

  const request = apiClient
    .get<{ url: string | null }>(`/products/${encodeURIComponent(id)}/thumbnail`)
    .then((data) => {
      const url = data?.url && String(data.url).trim() ? String(data.url) : null;
      thumbnailCache.set(id, url);
      thumbnailInflight.delete(id);
      return url;
    })
    .catch(() => {
      thumbnailInflight.delete(id);
      thumbnailCache.set(id, null);
      return null;
    });

  thumbnailInflight.set(id, request);
  return request;
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
