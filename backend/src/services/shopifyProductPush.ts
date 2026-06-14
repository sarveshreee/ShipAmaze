import { Types } from "mongoose";
import { Product } from "../models/Product.js";
import { ShopifyProductPush } from "../models/ShopifyProductPush.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { decrypt } from "../utils/crypto.js";
import * as shopifyService from "./shopify.service.js";
import type { ShopifyProductInput } from "./shopify.service.js";

export function parseWeightGrams(weightStr: string | undefined): number {
  if (!weightStr) return 500;
  const s = String(weightStr).toLowerCase();
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 500;
  if (s.includes("kg")) return Math.round(num * 1000);
  return Math.round(num);
}

function resolvePublicAssetBase(): string {
  const explicit = process.env.API_PUBLIC_URL?.trim() || process.env.BACKEND_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const frontend = process.env.FRONTEND_URL?.trim();
  if (frontend) return frontend.replace(/\/+$/, "");
  const cors = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
  if (cors) return cors.replace(/\/+$/, "");
  return "http://127.0.0.1:5000";
}

/** Shopify requires publicly reachable https/http image URLs.
 *  data: URLs are converted to a backend proxy URL so Shopify can fetch them. */
export function resolveShopifyImageUrls(rawImages: unknown, productId?: string): string[] {
  if (!Array.isArray(rawImages)) return [];
  const base = resolvePublicAssetBase();
  const out: string[] = [];
  for (let idx = 0; idx < rawImages.length; idx++) {
    const raw = rawImages[idx];
    const src = String(raw ?? "").trim();
    if (!src) continue;
    if (src.startsWith("data:")) {
      if (productId) {
        out.push(`${base}/api/shopify/product-image/${productId}/${idx}`);
      }
      continue;
    }
    if (/^https?:\/\//i.test(src)) {
      out.push(src);
      continue;
    }
    if (src.startsWith("/")) {
      out.push(`${base}${src}`);
      continue;
    }
    out.push(`${base}/${src.replace(/^\/+/, "")}`);
  }
  return out;
}

function resolveSellingPrice(product: Record<string, unknown>, override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  const sp = Number(product.sellingPrice ?? product.selling_price ?? 0);
  if (Number.isFinite(sp) && sp > 0) return sp;
  const cost = Number(product.price ?? 0);
  const shipping = Number(product.shippingCharge ?? product.shipping_charge ?? 0);
  const total = (Number.isFinite(cost) ? cost : 0) + (Number.isFinite(shipping) ? shipping : 0);
  if (total > 0) return total;
  throw new AppError(400, "Enter a valid selling price before pushing to Shopify.");
}

export function buildShopifyProductPayload(
  product: Record<string, unknown>,
  sellingPrice: number,
  variantId?: string,
  productId?: string
): ShopifyProductInput {
  const images = resolveShopifyImageUrls(product.images, productId);
  const tags = Array.isArray(product.tags) ? (product.tags as string[]).filter(Boolean).join(", ") : "";
  const description = String(
    product.long_description ??
      product.longDescription ??
      product.short_description ??
      product.shortDescription ??
      ""
  );

  const variantsRaw = product.variants;
  let variants: ShopifyProductInput["variants"];

  if (Array.isArray(variantsRaw) && variantsRaw.length > 0) {
    variants = variantsRaw.map((raw, i) => {
      const v = raw as Record<string, unknown>;
      const variantPrice = Number(v.selling_price ?? v.sellingPrice ?? v.price ?? sellingPrice);
      const row: ShopifyProductInput["variants"][number] = {
        title: String(v.title ?? v.name ?? `Variant ${i + 1}`),
        price: String(Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : sellingPrice),
        sku: String(v.sku ?? product.sku ?? ""),
        inventory_management: "shopify",
        inventory_quantity: Math.max(0, Number(v.stock ?? product.stock ?? 0)),
        weight: parseWeightGrams(String(v.weight ?? product.weight ?? "")),
        weight_unit: "g",
      };
      if (i === 0 && variantId) row.id = Number(variantId);
      return row;
    });
  } else {
    const row: ShopifyProductInput["variants"][number] = {
      price: String(sellingPrice),
      sku: String(product.sku ?? ""),
      inventory_management: "shopify",
      inventory_quantity: Math.max(0, Number(product.stock ?? 0)),
      weight: parseWeightGrams(String(product.weight ?? "")),
      weight_unit: "g",
    };
    if (variantId) row.id = Number(variantId);
    variants = [row];
  }

  return {
    title: String(product.name ?? "Product"),
    body_html: description || `<p>${String(product.name ?? "Product")}</p>`,
    product_type: String(product.category ?? ""),
    tags,
    status: "active",
    variants,
    images: images.map((src) => ({ src })),
  };
}

export async function getActiveShopifyConnection(ownerUserId: Types.ObjectId) {
  return ShopifyStoreConnection.findOne({ ownerUserId, isActive: true });
}

export async function getProductPushContext(ownerUserId: Types.ObjectId, productId: string) {
  if (!Types.ObjectId.isValid(productId)) throw new AppError(400, "Invalid product id");

  const conn = await getActiveShopifyConnection(ownerUserId);
  if (!conn) {
    return { connected: false as const };
  }

  let shopName = conn.shopDomain;
  try {
    const token = decrypt(conn.accessTokenEncrypted);
    const shop = await shopifyService.getShopDetails(token, conn.shopDomain);
    shopName = shop.name || conn.shopDomain;
  } catch {
    /* fall back to domain */
  }

  const push = await ShopifyProductPush.findOne({
    ownerUserId,
    productId: new Types.ObjectId(productId),
    shopDomain: conn.shopDomain,
  }).lean();

  return {
    connected: true as const,
    shopDomain: conn.shopDomain,
    shopName,
    connectionStatus: "Connected",
    published: !!push,
    shopifyProductId: push?.shopifyProductId ?? null,
    lastPushedAt: push?.updatedAt ?? push?.createdAt ?? null,
  };
}

export async function pushProductToShopifyStore(
  ownerUserId: Types.ObjectId,
  productId: string,
  sellingPriceOverride?: number
) {
  if (!Types.ObjectId.isValid(productId)) throw new AppError(400, "Invalid product id");

  const conn = await getActiveShopifyConnection(ownerUserId);
  if (!conn) {
    throw new AppError(400, "Connect your Shopify store from Channels before publishing products.");
  }

  const product = await Product.findById(productId).lean();
  if (!product) throw new AppError(404, "Product not found");
  if (String(product.status ?? "").toLowerCase() !== "active") {
    throw new AppError(400, "Only active marketplace products can be pushed to Shopify.");
  }

  const sellingPrice = resolveSellingPrice(product as Record<string, unknown>, sellingPriceOverride);
  const accessToken = decrypt(conn.accessTokenEncrypted);

  const existing = await ShopifyProductPush.findOne({
    ownerUserId,
    productId: product._id,
    shopDomain: conn.shopDomain,
  });

  const payload = buildShopifyProductPayload(
    product as Record<string, unknown>,
    sellingPrice,
    existing?.shopifyVariantId ?? undefined,
    productId
  );

  let shopifyProduct: shopifyService.ShopifyProductResult;
  if (existing?.shopifyProductId) {
    shopifyProduct = await shopifyService.updateProduct(
      accessToken,
      conn.shopDomain,
      existing.shopifyProductId,
      payload
    );
  } else {
    shopifyProduct = await shopifyService.createProduct(accessToken, conn.shopDomain, payload);
  }

  const shopifyProductId = String(shopifyProduct.id);
  const shopifyVariantId = shopifyProduct.variants?.[0]?.id
    ? String(shopifyProduct.variants[0].id)
    : existing?.shopifyVariantId;

  const saved = await ShopifyProductPush.findOneAndUpdate(
    { ownerUserId, productId: product._id, shopDomain: conn.shopDomain },
    {
      ownerUserId,
      productId: product._id,
      shopDomain: conn.shopDomain,
      shopifyProductId,
      shopifyVariantId,
      sellingPrice,
    },
    { upsert: true, new: true }
  );

  return {
    shopifyProductId: saved.shopifyProductId,
    shopifyVariantId: saved.shopifyVariantId ?? null,
    shopDomain: conn.shopDomain,
    updated: !!existing,
    sellingPrice: saved.sellingPrice,
  };
}
