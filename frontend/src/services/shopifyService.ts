import { apiClient } from "@/lib/apiClient";

export interface ShopifyStatus {
  connected: boolean;
  shopDomain?: string;
  scope?: string;
  installedAt?: string;
  lastSyncedAt?: string | null;
  syncCount?: number;
  lastSyncError?: string | null;
  syncedOrdersCount?: number;
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

export async function syncOrders(): Promise<ShopifySyncResult> {
  return apiClient.post<ShopifySyncResult>("/shopify/sync-orders");
}

export async function disconnectShopify(): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/shopify/disconnect");
}

export async function listShopifyConnectionsAdmin(): Promise<{ connections: ShopifyAdminConnection[] }> {
  return apiClient.get<{ connections: ShopifyAdminConnection[] }>("/shopify/admin/connections");
}
