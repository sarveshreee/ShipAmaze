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
  product_id?: number | null;
  variant_id?: number | null;
  /** Present on some webhook/API payloads */
  image?: { src?: string } | null;
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
  /** Legacy single gateway field (some API versions / webhooks). */
  gateway?: string | null;
  payment_gateway_names?: string[];
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
  image?: { src?: string } | null;
  images?: Array<{ src?: string; id?: number }>;
  variants: Array<{ id: number; price: string; sku: string; inventory_quantity: number; image_id?: number | null }>;
}

export interface ShopifyFulfillmentOrder {
  id: number;
  status: string;
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

function productPrimaryImageUrl(product: ShopifyProduct | undefined): string | undefined {
  if (!product) return undefined;
  const direct = product.image?.src?.trim();
  if (direct) return direct;
  const fromList = product.images?.find((img) => img?.src?.trim())?.src?.trim();
  return fromList || undefined;
}

function registerProductImages(product: ShopifyProduct | undefined, map: Map<string, string>) {
  if (!product) return;
  const primary = productPrimaryImageUrl(product);
  if (primary) {
    map.set(String(product.id), primary);
    map.set(`product:${product.id}`, primary);
  }
  const imagesById = new Map<number, string>();
  for (const img of product.images ?? []) {
    const src = img?.src?.trim();
    const id = (img as { id?: number }).id;
    if (src && id != null) imagesById.set(id, src);
  }
  for (const variant of product.variants ?? []) {
    const imageId = variant.image_id;
    const variantSrc =
      (imageId != null ? imagesById.get(imageId) : undefined) ||
      primary;
    if (variantSrc) map.set(`variant:${variant.id}`, variantSrc);
  }
}

/** Paginated map of Shopify product_id → primary image URL for order line-item enrichment. */
export async function buildShopifyProductImageMap(
  accessToken: string,
  shop: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null =
    `${shopifyBaseUrl(shop)}/products.json?limit=250&fields=id,image,images,variants`;

  while (url) {
    const res = await fetch(url, { method: "GET", headers: shopifyHeaders(accessToken) });
    if (!res.ok) break;
    const data = (await res.json()) as { products?: ShopifyProduct[] };
    for (const product of data.products ?? []) {
      registerProductImages(product, map);
    }
    url = parseNextPageUrl(res.headers.get("link"));
  }

  return map;
}

/** Resolve image URLs for line items when a full catalog map is unavailable (webhooks). */
export async function fetchProductImagesForLineItems(
  accessToken: string,
  shop: string,
  lineItems: ShopifyLineItem[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [
    ...new Set(
      lineItems
        .map((li) => (li as { product_id?: number | null }).product_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ].slice(0, 25);

  for (const id of ids) {
    try {
      const data = await shopifyFetch<{ product?: ShopifyProduct }>(
        `${shopifyBaseUrl(shop)}/products/${id}.json?fields=id,image,images,variants`,
        accessToken
      );
      registerProductImages(data.product, map);
    } catch {
      /* skip missing products */
    }
  }

  return map;
}

export async function getFulfillmentOrders(
  accessToken: string,
  shop: string,
  orderId: number | string
): Promise<ShopifyFulfillmentOrder[]> {
  const data = await shopifyRequest<{ fulfillment_orders?: ShopifyFulfillmentOrder[] }>(
    "GET",
    `${shopifyBaseUrl(shop)}/orders/${orderId}/fulfillment_orders.json`,
    accessToken
  );
  return Array.isArray(data.fulfillment_orders) ? data.fulfillment_orders : [];
}

export async function createFulfillment(
  accessToken: string,
  shop: string,
  input: {
    fulfillmentOrderIds: Array<number | string>;
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
  }
): Promise<unknown> {
  const lineItems = input.fulfillmentOrderIds.map((id) => ({ fulfillment_order_id: Number(id) }));
  return shopifyRequest<unknown>(
    "POST",
    `${shopifyBaseUrl(shop)}/fulfillments.json`,
    accessToken,
    {
      fulfillment: {
        line_items_by_fulfillment_order: lineItems,
        notify_customer: false,
        tracking_info: {
          number: input.trackingNumber,
          url: input.trackingUrl,
          company: input.trackingCompany,
        },
      },
    }
  );
}

/** Fetch a Shopify order's line items (requires read_orders scope). */
export async function getOrderLineItems(
  accessToken: string,
  shop: string,
  orderId: string | number
): Promise<Array<{ id: number; fulfillable_quantity: number }>> {
  try {
    const data = await shopifyFetch<{ order?: { line_items?: Array<{ id: number; fulfillable_quantity: number }> } }>(
      `${shopifyBaseUrl(shop)}/orders/${orderId}.json?fields=id,line_items`,
      accessToken
    );
    return Array.isArray(data.order?.line_items) ? (data.order!.line_items as Array<{ id: number; fulfillable_quantity: number }>) : [];
  } catch {
    return [];
  }
}

/** Fetch active store locations (requires read_locations scope). */
export async function getLocations(
  accessToken: string,
  shop: string
): Promise<Array<{ id: number; name: string; active: boolean }>> {
  try {
    const data = await shopifyFetch<{ locations?: Array<{ id: number; name: string; active: boolean }> }>(
      `${shopifyBaseUrl(shop)}/locations.json`,
      accessToken
    );
    return Array.isArray(data.locations) ? data.locations : [];
  } catch {
    return [];
  }
}

/**
 * Attempt A: POST /fulfillments.json with old body format (location_id + line_items).
 * Shopify may accept this with write_fulfillments scope (without needing fulfillment_order_ids).
 */
export async function createFulfillmentNewEndpointOldFormat(
  accessToken: string,
  shop: string,
  input: {
    locationId: number;
    lineItemIds: number[];
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
  }
): Promise<unknown> {
  const body: Record<string, unknown> = {
    location_id: input.locationId,
    notify_customer: false,
    ...(input.trackingNumber ? { tracking_number: input.trackingNumber } : {}),
    ...(input.trackingCompany ? { tracking_company: input.trackingCompany } : {}),
    ...(input.trackingUrl ? { tracking_url: input.trackingUrl } : {}),
    ...(input.lineItemIds.length > 0 ? { line_items: input.lineItemIds.map((id) => ({ id })) } : {}),
  };
  return shopifyRequest<unknown>(
    "POST",
    `${shopifyBaseUrl(shop)}/fulfillments.json`,
    accessToken,
    { fulfillment: body }
  );
}

/**
 * Attempt B: GET existing fulfillments for an order (requires read_orders only).
 * Returns fulfillment IDs + statuses.
 */
export async function getOrderFulfillments(
  accessToken: string,
  shop: string,
  orderId: string | number
): Promise<Array<{ id: number; status: string; tracking_number?: string }>> {
  try {
    const data = await shopifyFetch<{ fulfillments?: Array<{ id: number; status: string; tracking_number?: string }> }>(
      `${shopifyBaseUrl(shop)}/orders/${orderId}/fulfillments.json`,
      accessToken
    );
    return Array.isArray(data.fulfillments) ? data.fulfillments : [];
  } catch {
    return [];
  }
}

/**
 * Attempt C: PUT /fulfillments/{id}.json — update tracking on an existing fulfillment.
 * Works with write_fulfillments scope.
 */
export async function updateFulfillmentTracking(
  accessToken: string,
  shop: string,
  fulfillmentId: number,
  input: {
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
  }
): Promise<unknown> {
  return shopifyRequest<unknown>(
    "PUT",
    `${shopifyBaseUrl(shop)}/fulfillments/${fulfillmentId}/update_tracking.json`,
    accessToken,
    {
      fulfillment: {
        notify_customer: input.notifyCustomer ?? false,
        tracking_info: {
          number: input.trackingNumber,
          url: input.trackingUrl,
          company: input.trackingCompany,
        },
      },
    }
  );
}

/**
 * Kept for reference but deprecated — use createFulfillmentNewEndpointOldFormat instead.
 * POST /orders/{id}/fulfillments.json is removed in Shopify API 2022-07+ (returns 406).
 */
export async function createFulfillmentLegacyWithLocation(
  accessToken: string,
  shop: string,
  input: {
    orderId: string | number;
    locationId: number;
    lineItemIds: number[];
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
  }
): Promise<unknown> {
  const body: Record<string, unknown> = {
    location_id: input.locationId,
    notify_customer: false,
    ...(input.trackingNumber ? { tracking_number: input.trackingNumber } : {}),
    ...(input.trackingCompany ? { tracking_company: input.trackingCompany } : {}),
    ...(input.trackingUrl ? { tracking_url: input.trackingUrl } : {}),
    ...(input.lineItemIds.length > 0 ? { line_items: input.lineItemIds.map((id) => ({ id })) } : {}),
  };
  return shopifyRequest<unknown>(
    "POST",
    `${shopifyBaseUrl(shop)}/orders/${input.orderId}/fulfillments.json`,
    accessToken,
    { fulfillment: body }
  );
}

/**
 * Update an order's note_attributes and tags (requires write_orders scope only).
 * Used as a fallback when fulfillment scopes are missing — adds tracking
 * visibility in the Shopify admin order detail page.
 */
export async function updateOrderTrackingNote(
  accessToken: string,
  shop: string,
  orderId: string | number,
  params: {
    awb: string;
    status: string;
    trackingUrl?: string;
    courierName?: string;
    existingTags?: string;
  }
): Promise<void> {
  const statusTag = `ShipAmaze-${params.status.replace(/\s+/g, "-")}`;
  const shipAmazeTagPattern = /ShipAmaze-[A-Za-z0-9_-]+/g;
  const cleanedTags = (params.existingTags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !shipAmazeTagPattern.test(t))
    .join(", ");
  const newTags = [cleanedTags, statusTag].filter(Boolean).join(", ");

  const noteAttributes = [
    { name: "ShipAmaze AWB", value: params.awb },
    { name: "ShipAmaze Status", value: params.status },
    ...(params.trackingUrl ? [{ name: "ShipAmaze Tracking", value: params.trackingUrl }] : []),
    ...(params.courierName ? [{ name: "ShipAmaze Courier", value: params.courierName }] : []),
  ];

  await shopifyRequest<unknown>(
    "PUT",
    `${shopifyBaseUrl(shop)}/orders/${orderId}.json`,
    accessToken,
    { order: { id: Number(orderId), note_attributes: noteAttributes, tags: newTags } }
  );
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
