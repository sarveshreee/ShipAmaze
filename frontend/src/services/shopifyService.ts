import { apiClient } from "@/lib/apiClient";

export interface ShopifyStatus {
  connected: boolean;
  shopDomain?: string;
  scope?: string;
  installedAt?: string;
  lastSyncedAt?: string | null;
}

export interface ShopifySyncResult {
  ok: boolean;
  synced: number;
  inserted: number;
  updated: number;
  lastSyncedAt: string;
}

export async function getShopifyStatus(): Promise<ShopifyStatus> {
  return apiClient.get<ShopifyStatus>("/shopify/status");
}

/**
 * Fetches the Shopify OAuth URL from the backend, then navigates the browser there.
 * The browser will be redirected to Shopify and then back to /api/shopify/callback.
 */
export async function initiateShopifyConnect(shop: string): Promise<void> {
  const data = await apiClient.get<{ url: string }>(
    `/shopify/connect?shop=${encodeURIComponent(shop)}`
  );
  window.location.href = data.url;
}

export async function syncOrders(): Promise<ShopifySyncResult> {
  return apiClient.post<ShopifySyncResult>("/shopify/sync-orders");
}

export async function disconnectShopify(): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/shopify/disconnect");
}
