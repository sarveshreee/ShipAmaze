/**
 * Low-level Shopify REST API helpers.
 * All functions take an explicit accessToken + shop domain so they stay stateless.
 */

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
  line_items: ShopifyLineItem[];
  shipping_address?: {
    name: string;
    address1: string;
    city: string;
    zip: string;
    country: string;
    phone: string;
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

async function shopifyFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: shopifyHeaders(accessToken) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getShopDetails(accessToken: string, shop: string): Promise<ShopifyShop> {
  const data = await shopifyFetch<{ shop: ShopifyShop }>(
    `${shopifyBaseUrl(shop)}/shop.json`,
    accessToken
  );
  return data.shop;
}

export async function getOrders(
  accessToken: string,
  shop: string,
  limit = 250
): Promise<ShopifyOrder[]> {
  const data = await shopifyFetch<{ orders: ShopifyOrder[] }>(
    `${shopifyBaseUrl(shop)}/orders.json?limit=${limit}&status=any`,
    accessToken
  );
  return data.orders;
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
