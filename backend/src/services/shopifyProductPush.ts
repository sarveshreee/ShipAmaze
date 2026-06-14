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

type ShopifyImageObject = { src: string } | { attachment: string; filename: string };

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
  };
  return map[mime.toLowerCase().trim()] ?? "jpg";
}

/**
 * Convert product images into Shopify image objects.
 * - data: URLs → { attachment, filename } so Shopify stores them directly (no proxy needed)
 * - http(s) URLs → { src } for Shopify to fetch
 */
export function resolveShopifyImages(rawImages: unknown): ShopifyImageObject[] {
  if (!Array.isArray(rawImages)) return [];
  const out: ShopifyImageObject[] = [];
  for (const raw of rawImages) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    if (src.startsWith("data:")) {
      const match = src.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        const mime = match[1];
        const base64Data = match[2].trim();
        const ext = mimeToExtension(mime);
        out.push({ attachment: base64Data, filename: `product-image.${ext}` });
      }
      continue;
    }
    if (/^https?:\/\//i.test(src)) {
      out.push({ src });
      continue;
    }
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
  _productId?: string
): ShopifyProductInput {
  const images = resolveShopifyImages(product.images);
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
    images,
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
    existing?.shopifyVariantId ?? undefined
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
