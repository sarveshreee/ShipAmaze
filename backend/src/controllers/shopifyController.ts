import type { Request, Response } from "express";
import { createHmac, randomBytes } from "crypto";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { Order } from "../models/Order.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import * as shopifyService from "../services/shopify.service.js";

/* ------------------------------------------------------------------ */
/*  Env helpers                                                          */
/* ------------------------------------------------------------------ */
function cfg() {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const scopes = process.env.SHOPIFY_SCOPES || "read_orders,read_products";
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  if (!apiKey || !apiSecret || !redirectUri) {
    throw new AppError(500, "Shopify is not configured. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_REDIRECT_URI in .env");
  }
  return { apiKey, apiSecret, scopes, redirectUri };
}

/* ------------------------------------------------------------------ */
/*  HMAC verification (validates Shopify callback authenticity)         */
/* ------------------------------------------------------------------ */
function verifyShopifyHmac(query: Record<string, string>, secret: string): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.entries(rest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return digest === hmac;
}

/* ------------------------------------------------------------------ */
/*  State token: encode userId + nonce into a signed string            */
/* ------------------------------------------------------------------ */
function encodeState(userId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const raw = `${userId}:${nonce}`;
  return Buffer.from(raw).toString("base64url");
}

function decodeState(state: string): { userId: string } {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const [userId] = raw.split(":");
    if (!userId) throw new Error("bad state");
    return { userId };
  } catch {
    throw new AppError(400, "Invalid OAuth state");
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/connect?shop=mystore                              */
/*  Returns the Shopify OAuth URL as JSON — frontend navigates there.  */
/* ------------------------------------------------------------------ */
export const initiateConnect = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { apiKey, scopes, redirectUri } = cfg();

  const shop = (req.query.shop as string | undefined)?.trim();
  if (!shop) throw new AppError(400, "shop query param is required (e.g. ?shop=mystore.myshopify.com)");

  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const state = encodeState(String(req.user._id));

  const oauthUrl =
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.json({ url: oauthUrl });
});

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/callback (called by Shopify after OAuth)           */
/* ------------------------------------------------------------------ */
export const handleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { apiKey, apiSecret } = cfg();
  const query = req.query as Record<string, string>;

  if (!verifyShopifyHmac(query, apiSecret)) {
    return res.redirect(`${process.env.CORS_ORIGIN || "http://localhost:8080"}/settings?shopify=error&reason=invalid_hmac`);
  }

  const { code, shop, state } = query;
  if (!code || !shop || !state) {
    return res.redirect(`${process.env.CORS_ORIGIN || "http://localhost:8080"}/settings?shopify=error&reason=missing_params`);
  }

  const { userId } = decodeState(state);

  // Exchange code for access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });

  if (!tokenRes.ok) {
    return res.redirect(`${process.env.CORS_ORIGIN || "http://localhost:8080"}/settings?shopify=error&reason=token_exchange_failed`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };
  const { access_token, scope } = tokenData;

  // Get shop details to verify
  const shopDetails = await shopifyService.getShopDetails(access_token, shop);

  // Fetch the user's role
  const { User } = await import("../models/User.js");
  const user = await User.findById(userId);
  if (!user) {
    return res.redirect(`${process.env.CORS_ORIGIN || "http://localhost:8080"}/settings?shopify=error&reason=user_not_found`);
  }

  const accessTokenEncrypted = encrypt(access_token);

  // Upsert — one record per user+shop
  await ShopifyStoreConnection.findOneAndUpdate(
    { ownerUserId: userId, shopDomain: shopDetails.myshopify_domain },
    {
      ownerUserId: userId,
      shopDomain: shopDetails.myshopify_domain,
      accessTokenEncrypted,
      scope,
      installedAt: new Date(),
      role: user.role as "admin" | "vendor" | "dropshipper",
      isActive: true,
    },
    { upsert: true, new: true }
  );

  const origin = process.env.CORS_ORIGIN || "http://localhost:8080";
  res.redirect(`${origin}/settings?shopify=connected&shop=${encodeURIComponent(shopDetails.myshopify_domain)}`);
});

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/status                                             */
/* ------------------------------------------------------------------ */
export const getStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const conn = await ShopifyStoreConnection.findOne({
    ownerUserId: req.user._id,
    isActive: true,
  }).lean();

  if (!conn) {
    return res.json({ connected: false });
  }

  res.json({
    connected: true,
    shopDomain: conn.shopDomain,
    scope: conn.scope,
    installedAt: conn.installedAt,
    lastSyncedAt: conn.lastSyncedAt ?? null,
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/shopify/disconnect                                        */
/* ------------------------------------------------------------------ */
export const disconnect = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await ShopifyStoreConnection.findOneAndUpdate(
    { ownerUserId: req.user._id, isActive: true },
    { isActive: false }
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  POST /api/shopify/sync-orders                                       */
/* ------------------------------------------------------------------ */
export const syncOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const conn = await ShopifyStoreConnection.findOne({
    ownerUserId: req.user._id,
    isActive: true,
  });
  if (!conn) throw new AppError(400, "No active Shopify store connected. Please connect first.");

  const accessToken = decrypt(conn.accessTokenEncrypted);
  const shopOrders = await shopifyService.getOrders(accessToken, conn.shopDomain);

  let inserted = 0;
  let updated = 0;

  for (const so of shopOrders) {
    const externalId = `shopify-${so.id}`;
    const shipping = so.shipping_address;

    const mapped = {
      orderId: externalId,
      customer: shipping?.name || so.email || "Shopify Customer",
      phone: shipping?.phone || so.phone || "",
      address: shipping?.address1 || "",
      city: shipping?.city || "",
      pincode: shipping?.zip || "",
      weight: "",
      courier: "Delhivery",
      payment: so.financial_status === "paid" ? "Prepaid" : "COD",
      status: so.fulfillment_status || "pending",
      date: so.created_at.slice(0, 10),
      awb: "",
      amount: parseFloat(so.total_price) || 0,
      products: so.line_items.map((li) => ({
        name: li.title,
        qty: li.quantity,
        price: parseFloat(li.price),
        sku: li.sku,
      })),
      createdBy: req.user!._id,
      externalSource: "shopify",
      externalOrderName: so.name,
    };

    const existing = await Order.findOne({ orderId: externalId });
    if (existing) {
      // Only update mutable fields, preserve fulfillment data
      existing.amount = mapped.amount;
      existing.products = mapped.products;
      existing.payment = mapped.payment;
      await existing.save();
      updated++;
    } else {
      await Order.create(mapped);
      inserted++;
    }
  }

  // Update lastSyncedAt
  conn.lastSyncedAt = new Date();
  await conn.save();

  res.json({
    ok: true,
    synced: shopOrders.length,
    inserted,
    updated,
    lastSyncedAt: conn.lastSyncedAt,
  });
});
