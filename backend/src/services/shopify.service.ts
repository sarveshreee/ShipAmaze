/**
 * Low-level Shopify REST API helpers.
 * All functions take an explicit accessToken + shop domain so they stay stateless.
 */

import { AppError } from "../middleware/errorMiddleware.js";
import {
  getRequestedShopifyScopes,
  missingShopifyScopes,
  parseShopifyScopeList,
} from "../utils/shopifyScopes.js";

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

function shopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION?.trim() || "2026-01";
}

function shopifyHeaders(accessToken: string) {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

function shopifyBaseUrl(shop: string) {
  const domain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  return `https://${domain}/admin/api/${shopifyApiVersion()}`;
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

function shopifyAuthError(status: number, bodyText: string, endpoint: string): AppError {
  const detail = formatShopifyErrorBody(bodyText);
  if (status === 403) {
    const msg =
      endpoint.includes("orders") || detail.toLowerCase().includes("order")
        ? "Shopify denied access to orders. In Shopify Admin → Develop apps → your custom app → Configuration, enable read_orders (and write_orders) under Admin API scopes, save, then reconnect in Channels."
        : `Shopify denied access. Check your custom app Admin API scopes and reconnect in Channels. (${detail})`;
    return new AppError(502, msg);
  }
  if (status === 401) {
    return new AppError(
      502,
      "Shopify access token is invalid or revoked. Disconnect and reconnect your store in Channels with your custom app Client ID and Secret."
    );
  }
  return new AppError(502, `Shopify API error ${status}: ${detail}`);
}

export type ShopifyConnectionCheck = {
  ok: boolean;
  issue?: "invalid_token" | "missing_scope" | "api_error";
  message?: string;
};

export async function getGrantedAccessScopes(accessToken: string, shop: string): Promise<Set<string>> {
  const domain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const url = `https://${domain}/admin/oauth/access_scopes.json`;
  try {
    const res = await fetch(url, { method: "GET", headers: shopifyHeaders(accessToken) });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { access_scopes?: Array<{ handle?: string }> };
    const handles = (data.access_scopes ?? [])
      .map((s) => s.handle?.trim())
      .filter((h): h is string => Boolean(h));
    return new Set(handles);
  } catch {
    return new Set();
  }
}

/** Prefer token scope string; fall back to access_scopes.json when incomplete. */
export async function resolveGrantedAccessScopes(
  accessToken: string,
  shop: string,
  scopeFromToken: unknown
): Promise<Set<string>> {
  const fromToken = parseShopifyScopeList(scopeFromToken);
  const required = getRequestedShopifyScopes();
  const tokenMissing = missingShopifyScopes(fromToken, required);
  if (tokenMissing.length === 0 && fromToken.size > 0) {
    return fromToken;
  }

  const fromApi = await getGrantedAccessScopes(accessToken, shop);
  if (fromApi.size > 0) return fromApi;

  return fromToken;
}

/** Validates shop + orders API access (same checks used by manual sync). */
export async function verifyStoreConnection(
  accessToken: string,
  shop: string
): Promise<ShopifyConnectionCheck> {
  try {
    await getShopDetails(accessToken, shop);
  } catch (e: unknown) {
    if (e instanceof AppError) {
      const issue = e.message.toLowerCase().includes("scope") ? "missing_scope" : "invalid_token";
      return { ok: false, issue, message: e.message };
    }
    return { ok: false, issue: "api_error", message: "Could not reach Shopify." };
  }

  const probeUrl = `${shopifyBaseUrl(shop)}/orders.json?limit=1&status=any`;
  try {
    const res = await fetch(probeUrl, { method: "GET", headers: shopifyHeaders(accessToken) });
    if (res.ok) return { ok: true };
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      const err = shopifyAuthError(res.status, text, "orders.json");
      return {
        ok: false,
        issue: res.status === 403 ? "missing_scope" : "invalid_token",
        message: err.message,
      };
    }
    return {
      ok: false,
      issue: "api_error",
      message: shopifyAuthError(res.status, text, "orders.json").message,
    };
  } catch {
    return { ok: false, issue: "api_error", message: "Could not verify Shopify order access." };
  }
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
        throw shopifyAuthError(res.status, text, url);
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
        throw shopifyAuthError(res.status, text, "orders.json");
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
  images?: Array<{ src: string } | { attachment: string; filename: string }>;
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
