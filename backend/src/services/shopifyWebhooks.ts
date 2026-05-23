/**
 * Registers Shopify Admin API webhooks after OAuth install (idempotent per shop).
 */

import { AppError } from "../middleware/errorMiddleware.js";
import * as shopifyService from "./shopify.service.js";

export const REQUIRED_SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "app/uninstalled",
] as const;

export type ShopifyWebhookEnsureResult = {
  address: string;
  registered: string[];
  skipped: string[];
};

function normalizeWebhookAddress(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** Public webhook endpoint — env override or derived from SHOPIFY_REDIRECT_URI origin. */
export function resolveShopifyWebhookUrl(): string {
  const explicit = process.env.SHOPIFY_WEBHOOK_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const redirectUri = process.env.SHOPIFY_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      const u = new URL(redirectUri);
      return `${u.origin}/api/shopify/webhooks`;
    } catch {
      /* fall through */
    }
  }

  throw new AppError(
    500,
    "Shopify webhook URL is not configured. Set SHOPIFY_WEBHOOK_URL or SHOPIFY_REDIRECT_URI."
  );
}

/**
 * Ensures required webhooks exist for this shop at our callback URL.
 * Skips topics already registered to the same address (safe on reconnect / reinstall).
 */
export async function ensureShopifyWebhooksRegistered(
  accessToken: string,
  shop: string
): Promise<ShopifyWebhookEnsureResult> {
  const address = resolveShopifyWebhookUrl();
  const targetNorm = normalizeWebhookAddress(address);
  const existing = await shopifyService.listWebhooks(accessToken, shop);

  const topicsAtOurUrl = new Set(
    existing
      .filter((w) => normalizeWebhookAddress(w.address) === targetNorm)
      .map((w) => w.topic.toLowerCase())
  );

  const registered: string[] = [];
  const skipped: string[] = [];

  for (const topic of REQUIRED_SHOPIFY_WEBHOOK_TOPICS) {
    if (topicsAtOurUrl.has(topic.toLowerCase())) {
      skipped.push(topic);
      continue;
    }
    await shopifyService.createWebhook(accessToken, shop, topic, address);
    registered.push(topic);
    topicsAtOurUrl.add(topic.toLowerCase());
  }

  return { address, registered, skipped };
}
