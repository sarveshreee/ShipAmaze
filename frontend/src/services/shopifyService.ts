import { apiClient } from "@/lib/apiClient";

export interface ShopifyConnectionStatus {
  id: string;
  connected: boolean;
  shopDomain: string;
  scope: string;
  installedAt: string;
  lastSyncedAt?: string | null;
  syncCount?: number;
  lastSyncError?: string | null;
  syncedOrdersCount?: number;
  tokenHealth?: "ok" | "invalid_token" | "missing_scope" | "decrypt_failed" | "api_error";
  needsReconnect?: boolean;
  connectionMessage?: string | null;
}

export interface ShopifyStatus {
  connected: boolean;
  connections?: ShopifyConnectionStatus[];
  shopDomain?: string;
  scope?: string;
  installedAt?: string;
  lastSyncedAt?: string | null;
  syncCount?: number;
  lastSyncError?: string | null;
  syncedOrdersCount?: number;
  tokenHealth?: "ok" | "invalid_token" | "missing_scope" | "decrypt_failed" | "api_error";
  needsReconnect?: boolean;
  connectionMessage?: string | null;
  redirectUri?: string;
  appUrl?: string;
}

export type ShopifySkipReason = {
  shopifyId: string;
  orderName?: string;
  reason: string;
};

export interface ShopifySyncResult {
  ok: boolean;
  synced: number;
  inserted: number;
  updated: number;
  skipped?: number;
  skipReasons?: ShopifySkipReason[];
  lastSyncedAt: string;
  lastSyncError?: string | null;
  shopDomain?: string;
  stores?: Array<{
    shopDomain: string;
    synced: number;
    inserted: number;
    updated: number;
    skipped: number;
  }>;
}

export type ShopifyAdminConnection = {
  id: string;
  ownerUserId: string;
  shopDomain: string;
  role: string;
  isActive: boolean;
  scope: string;
  installedAt: string;
  lastSyncedAt: string | null;
  syncCount: number;
  lastSyncError: string | null;
  disconnectedAt: string | null;
};

export async function getShopifyStatus(): Promise<ShopifyStatus> {
  return apiClient.get<ShopifyStatus>("/shopify/status");
}

/** OAuth URL using merchant's custom app Client ID + Secret (importerr-style). */
export async function initiateShopifyConnect(
  shop: string,
  shopifyApiKey: string,
  shopifyApiSecret: string
): Promise<{ url: string }> {
  return apiClient.post<{ url: string }>(
    `/shopify/connect?shop=${encodeURIComponent(shop)}`,
    { shopifyApiKey, shopifyApiSecret }
  );
}

export async function syncOrders(shopDomain?: string): Promise<ShopifySyncResult> {
  return apiClient.post<ShopifySyncResult>("/shopify/sync-orders", shopDomain ? { shopDomain } : {});
}

export async function disconnectShopify(shopDomain?: string): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/shopify/disconnect", shopDomain ? { shopDomain } : {});
}

export async function listShopifyConnectionsAdmin(): Promise<{ connections: ShopifyAdminConnection[] }> {
  return apiClient.get<{ connections: ShopifyAdminConnection[] }>("/shopify/admin/connections");
}

export type ShopifyProductPushStatus = {
  connected: boolean;
  shopDomain?: string;
  shopName?: string;
  connectionStatus?: string;
  published?: boolean;
  shopifyProductId?: string | null;
  lastPushedAt?: string | null;
};

export type ShopifyPushProductResult = {
  shopifyProductId: string;
  shopifyVariantId: string | null;
  shopDomain: string;
  updated: boolean;
  sellingPrice: number;
};

export async function getProductPushStatus(productId: string): Promise<ShopifyProductPushStatus> {
  return apiClient.get<ShopifyProductPushStatus>(`/shopify/product-push/${encodeURIComponent(productId)}`);
}

export async function pushProductToShopify(body: {
  productId: string;
  sellingPrice?: number;
}): Promise<ShopifyPushProductResult> {
  return apiClient.post<ShopifyPushProductResult>("/shopify/push-product", body);
}
