/**
 * Low-level Shopify REST API helpers.
 * All functions take an explicit accessToken + shop domain so they stay stateless.
 */

import { AppError } from "../middleware/errorMiddleware.js";

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  plan_name: string;
  currency: string;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  variant_title: string | null;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  cancelled_at?: string | null;
  note?: string | null;
  tags?: string | null;
  line_items: ShopifyLineItem[];
  shipping_address?: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    zip: string;
    country: string;
    phone: string;
    province?: string;
  };
}

export interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  variants: Array<{ id: number; price: string; sku: string; inventory_quantity: number }>;
}

function shopifyHeaders(accessToken: string) {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

function shopifyBaseUrl(shop: string) {
  const domain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  return `https://${domain}/admin/api/2024-01`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatShopifyErrorBody(text: string): string {
  let message = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  try {
    const parsed = JSON.parse(text) as { errors?: string | string[] | Record<string, unknown> };
    if (parsed.errors) {
      if (typeof parsed.errors === "string") message = parsed.errors;
      else if (Array.isArray(parsed.errors)) message = parsed.errors.join(", ");
      else message = JSON.stringify(parsed.errors);
    }
  } catch {
    /* keep raw snippet */
  }
  return message;
}

async function shopifyRequest<T>(
  method: "GET" | "POST" | "PUT",
  url: string,
  accessToken: string,
  body?: unknown
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method,
      headers: shopifyHeaders(accessToken),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
      await sleep(Math.min(30, Math.max(1, retryAfter)) * 1000 * (attempt + 1));
      lastErr = new AppError(429, "Shopify rate limit — retrying shortly");
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      const message = formatShopifyErrorBody(text);
      if (res.status === 401 || res.status === 403) {
        // Use 502 (not 401) so the frontend does not treat this as a ShipAmaze session expiry.
        throw new AppError(502, "Shopify rejected this access token. Reconnect your store in Channels.");
      }
      throw new AppError(502, `Shopify API error ${res.status}: ${message}`);
    }
    return res.json() as Promise<T>;
  }
  throw lastErr instanceof Error ? lastErr : new AppError(429, "Shopify rate limit exceeded. Try again in a minute.");
}

async function shopifyFetch<T>(url: string, accessToken: string): Promise<T> {
  return shopifyRequest<T>("GET", url, accessToken);
}

export interface ShopifyWebhookSubscription {
  id: number;
  topic: string;
  address: string;
  format: string;
}

export async function listWebhooks(accessToken: string, shop: string): Promise<ShopifyWebhookSubscription[]> {
  const data = await shopifyRequest<{ webhooks?: ShopifyWebhookSubscription[] }>(
    "GET",
    `${shopifyBaseUrl(shop)}/webhooks.json?limit=250`,
    accessToken
  );
  return Array.isArray(data.webhooks) ? data.webhooks : [];
}

export async function createWebhook(
  accessToken: string,
  shop: string,
  topic: string,
  address: string
): Promise<ShopifyWebhookSubscription> {
  const data = await shopifyRequest<{ webhook: ShopifyWebhookSubscription }>(
    "POST",
    `${shopifyBaseUrl(shop)}/webhooks.json`,
    accessToken,
    { webhook: { topic, address, format: "json" } }
  );
  return data.webhook;
}

export async function getShopDetails(accessToken: string, shop: string): Promise<ShopifyShop> {
  const data = await shopifyFetch<{ shop: ShopifyShop }>(
    `${shopifyBaseUrl(shop)}/shop.json`,
    accessToken
  );
  return data.shop;
}

/** Parse Shopify REST `Link` header for rel="next". */
function parseNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Fetch all pages of orders (paid + unpaid, open + closed). */
export async function getOrders(accessToken: string, shop: string): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let url: string | null = `${shopifyBaseUrl(shop)}/orders.json?limit=250&status=any`;

  while (url) {
    let lastErr: unknown;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, { method: "GET", headers: shopifyHeaders(accessToken) });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
        await sleep(Math.min(30, Math.max(1, retryAfter)) * 1000 * (attempt + 1));
        lastErr = new AppError(429, "Shopify rate limit — retrying shortly");
        continue;
      }
      break;
    }
    if (!res) {
      throw lastErr instanceof Error ? lastErr : new AppError(429, "Shopify rate limit exceeded.");
    }
    if (!res.ok) {
      const text = await res.text();
      const snippet = text.length > 400 ? `${text.slice(0, 400)}…` : text;
      if (res.status === 401 || res.status === 403) {
        // Use 502 (not 401) so the frontend does not treat this as a ShipAmaze session expiry.
        throw new AppError(502, "Shopify rejected this access token. Reconnect your store in Channels.");
      }
      throw new AppError(502, `Shopify API error ${res.status}: ${snippet}`);
    }

    const data = (await res.json()) as { orders?: ShopifyOrder[] };
    if (Array.isArray(data.orders)) all.push(...data.orders);
    url = parseNextPageUrl(res.headers.get("link"));
  }

  return all;
}

export async function getProducts(
  accessToken: string,
  shop: string,
  limit = 250
): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
    `${shopifyBaseUrl(shop)}/products.json?limit=${limit}`,
    accessToken
  );
  return data.products;
}

export type ShopifyProductInput = {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: "active" | "draft" | "archived";
  variants: Array<{
    id?: number;
    title?: string;
    price: string;
    sku?: string;
    inventory_management?: string;
    inventory_quantity?: number;
    weight?: number;
    weight_unit?: "g" | "kg" | "lb" | "oz";
  }>;
  images?: Array<{ src: string }>;
};

export type ShopifyProductResult = {
  id: number;
  title: string;
  status: string;
  variants: Array<{ id: number; price: string; sku: string; inventory_quantity: number }>;
};

export async function createProduct(
  accessToken: string,
  shop: string,
  product: ShopifyProductInput
): Promise<ShopifyProductResult> {
  const data = await shopifyRequest<{ product: ShopifyProductResult }>(
    "POST",
    `${shopifyBaseUrl(shop)}/products.json`,
    accessToken,
    { product }
  );
  return data.product;
}

export async function updateProduct(
  accessToken: string,
  shop: string,
  shopifyProductId: number | string,
  product: ShopifyProductInput
): Promise<ShopifyProductResult> {
  const id = Number(shopifyProductId);
  const data = await shopifyRequest<{ product: ShopifyProductResult }>(
    "PUT",
    `${shopifyBaseUrl(shop)}/products/${id}.json`,
    accessToken,
    { product: { ...product, id } }
  );
  return data.product;
}
