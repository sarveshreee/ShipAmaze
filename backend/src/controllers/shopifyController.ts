import type { Request, Response } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { ShopifyWebhookReceipt, defaultWebhookReceiptExpiry } from "../models/ShopifyWebhookReceipt.js";
import { Order } from "../models/Order.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import * as shopifyService from "../services/shopify.service.js";
import {
  buildShopifyOrderPayload,
  mergeShopifyPayloadIntoOrder,
  shopifyExternalOrderId,
} from "../services/shopifyOrderSync.js";
import type { ShopifyOrder } from "../services/shopify.service.js";
import type { ShopifySyncUserContext } from "../services/shopifyOrderSync.js";

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

function resolveFrontendBaseUrl(): string {
  const explicit = process.env.FRONTEND_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const firstCors = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
  if (firstCors) return firstCors.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:8080";
  throw new AppError(500, "Set FRONTEND_URL or the first CORS_ORIGIN entry for Shopify OAuth redirects.");
}

function buildFrontendRedirect(status: "connected" | "error", reason?: string): string {
  const frontendBaseUrl = resolveFrontendBaseUrl();
  const postConnectPath = process.env.SHOPIFY_POST_CONNECT_PATH || "/dropshipper/channels";
  const normalisedPath = postConnectPath.startsWith("/") ? postConnectPath : `/${postConnectPath}`;
  const u = new URL(`${frontendBaseUrl}${normalisedPath}`);
  u.searchParams.set("shopify", status);
  if (status === "error" && reason?.trim()) {
    u.searchParams.set("shopify_reason", reason.trim().slice(0, 280));
  }
  return u.toString();
}

/* ------------------------------------------------------------------ */
/*  HMAC verification (validates Shopify callback authenticity)         */
/* ------------------------------------------------------------------ */
function verifyShopifyHmac(query: Record<string, string>, secret: string): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;
  const message = Object.entries(query)
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(hmac, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  State store: temporary OAuth state (in-memory)                      */
/* ------------------------------------------------------------------ */
type OAuthStateRecord = { ownerUserId: string; createdAtMs: number };
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map<string, OAuthStateRecord>();

const syncInFlight = new Set<string>();

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000;
}

function cleanupExpiredStates(nowMs = Date.now()) {
  for (const [k, v] of oauthStateStore.entries()) {
    if (nowMs - v.createdAtMs > OAUTH_STATE_TTL_MS) oauthStateStore.delete(k);
  }
}

function createOAuthState(ownerUserId: string): string {
  cleanupExpiredStates();
  const state = randomBytes(16).toString("hex");
  oauthStateStore.set(state, { ownerUserId, createdAtMs: Date.now() });
  return state;
}

function consumeOAuthState(state: string): { ownerUserId: string } {
  const rec = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  if (!rec) throw new AppError(400, "Invalid OAuth state");
  if (Date.now() - rec.createdAtMs > OAUTH_STATE_TTL_MS) throw new AppError(400, "Expired OAuth state");
  return { ownerUserId: rec.ownerUserId };
}

function isValidShopDomain(shop: string): boolean {
  const s = shop.trim().toLowerCase();
  return /^(?!-)[a-z0-9-]+(?<!-)\.myshopify\.com$/.test(s);
}

function firstQueryValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/connect?shop=mystore                              */
/*  Returns the Shopify OAuth URL as JSON — frontend navigates there.  */
/* ------------------------------------------------------------------ */
export const initiateConnect = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { apiKey, scopes, redirectUri } = cfg();

  const shop = firstQueryValue((req.query as Record<string, unknown>).shop)?.trim();
  if (!shop) throw new AppError(400, "shop query param is required (e.g. ?shop=mystore.myshopify.com)");

  if (!isValidShopDomain(shop)) {
    throw new AppError(400, "Invalid shop domain. It must end with .myshopify.com (e.g. mystore.myshopify.com)");
  }

  const shopDomain = shop.toLowerCase();
  const state = createOAuthState(String(req.user._id));

  const oauthUrl =
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=per-user`;

  if (process.env.NODE_ENV === "development") {
    console.info("[shopify] oauth initiate", { shop: shopDomain });
  }

  res.json({ url: oauthUrl });
});

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/callback (called by Shopify after OAuth)           */
/* ------------------------------------------------------------------ */
export const handleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { apiKey, apiSecret } = cfg();
  const qraw = req.query as Record<string, unknown>;
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(qraw)) {
    const fv = firstQueryValue(v);
    if (fv !== undefined) query[k] = fv;
  }

  if (!verifyShopifyHmac(query, apiSecret)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[shopify] oauth callback HMAC verification failed");
    }
    res.redirect(buildFrontendRedirect("error", "Could not verify OAuth callback (invalid signature)."));
    return;
  }

  const { code, shop, state } = query;
  if (!code || !shop) {
    console.warn("[shopify:oauth] callback missing code/shop");
    res.redirect(buildFrontendRedirect("error", "OAuth callback was missing code or shop."));
    return;
  }

  if (!isValidShopDomain(shop)) {
    console.warn("[shopify:oauth] callback invalid shop domain=", shop);
    res.redirect(buildFrontendRedirect("error", "Invalid shop domain in callback."));
    return;
  }

  if (!state) {
    console.warn("[shopify:oauth] callback missing state");
    res.redirect(buildFrontendRedirect("error", "Missing OAuth state. Start connect again from ShipAmaze."));
    return;
  }

  let ownerUserId: string;
  try {
    ownerUserId = consumeOAuthState(state).ownerUserId;
  } catch {
    console.warn("[shopify:oauth] callback invalid/expired state");
    res.redirect(buildFrontendRedirect("error", "Session expired or invalid. Start connect again from ShipAmaze."));
    return;
  }

  // Exchange code for access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });

  if (!tokenRes.ok) {
    console.warn("[shopify:oauth] token exchange failed status=", tokenRes.status);
    res.redirect(buildFrontendRedirect("error", "Token exchange with Shopify failed. Try again or reinstall the app."));
    return;
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };
  const { access_token, scope } = tokenData;
  if (process.env.NODE_ENV === "development") {
    console.info("[shopify] oauth token exchanged", { scope });
  }

  // Get shop details to verify
  const shopDetails = await shopifyService.getShopDetails(access_token, shop);

  // Fetch the user's role
  const { User } = await import("../models/User.js");
  const user = await User.findById(ownerUserId);
  if (!user) {
    console.warn("[shopify:oauth] owner user not found ownerUserId=", ownerUserId);
    res.redirect(buildFrontendRedirect("error", "User session no longer valid. Log in and connect again."));
    return;
  }

  const accessTokenEncrypted = encrypt(access_token);

  // Upsert — one record per user+shop
  await ShopifyStoreConnection.findOneAndUpdate(
    { ownerUserId, shopDomain: shopDetails.myshopify_domain },
    {
      ownerUserId,
      shopDomain: shopDetails.myshopify_domain,
      accessTokenEncrypted,
      scope,
      installedAt: new Date(),
      role: user.role as "admin" | "vendor" | "dropshipper",
      isActive: true,
      disconnectedAt: null,
      lastSyncError: null,
    },
    { upsert: true, new: true }
  );

  res.redirect(buildFrontendRedirect("connected"));
});

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/status                                             */
/* ------------------------------------------------------------------ */
export const getStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const conn = await ShopifyStoreConnection.findOne({
    ownerUserId: req.user._id,
    isActive: true,
  })
    .select("shopDomain scope installedAt lastSyncedAt syncCount lastSyncError")
    .lean();

  if (!conn) {
    res.json({ connected: false });
    return;
  }

  const ownerOr = {
    $or: [{ ownerUserId: req.user._id }, { createdBy: req.user._id }, { dropshipperId: req.user._id }],
  };
  const shopifyOr = { $or: [{ externalSource: "shopify" }, { channel: "Shopify" }] };
  let syncedOrdersCount = 0;
  if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ userId: req.user._id }).select("_id").lean();
    if (v) {
      syncedOrdersCount = await Order.countDocuments({
        $and: [{ vendorId: v._id }, shopifyOr],
      });
    }
  } else {
    syncedOrdersCount = await Order.countDocuments({
      $and: [ownerOr, shopifyOr],
    });
  }

  res.json({
    connected: true,
    shopDomain: conn.shopDomain,
    scope: conn.scope,
    installedAt: conn.installedAt,
    lastSyncedAt: conn.lastSyncedAt ?? null,
    syncCount: conn.syncCount ?? 0,
    lastSyncError: conn.lastSyncError ?? null,
    syncedOrdersCount,
  });
});


/* ------------------------------------------------------------------ */
/*  POST /api/shopify/disconnect                                        */
/* ------------------------------------------------------------------ */
export const disconnect = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await ShopifyStoreConnection.findOneAndUpdate(
    { ownerUserId: req.user._id, isActive: true },
    { isActive: false, disconnectedAt: new Date() }
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  POST /api/shopify/sync-orders                                       */
/* ------------------------------------------------------------------ */
export const syncOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const lockKey = String(req.user._id);
  if (syncInFlight.has(lockKey)) {
    throw new AppError(429, "Order sync is already running. Please wait for it to finish.");
  }
  syncInFlight.add(lockKey);

  try {
    const conn = await ShopifyStoreConnection.findOne({
      ownerUserId: req.user._id,
      isActive: true,
    });
    if (!conn) {
      throw new AppError(400, "No active Shopify store connected. Please connect first.");
    }

    let shopOrders: ShopifyOrder[] = [];
    try {
      const accessToken = decrypt(conn.accessTokenEncrypted);
      shopOrders = await shopifyService.getOrders(accessToken, conn.shopDomain);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Shopify sync failed";
      conn.lastSyncError = msg;
      await conn.save();
      throw e instanceof AppError ? e : new AppError(502, msg);
    }

    const vendor =
      req.user.role === "vendor" ? await Vendor.findOne({ userId: req.user._id }).select("_id").lean() : null;
    const ctx: ShopifySyncUserContext = {
      ownerUserId: req.user._id,
      createdBy: req.user._id,
      dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
      vendorId: vendor?._id,
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const so of shopOrders) {
      try {
        if (!so || typeof so.id !== "number") {
          skipped++;
          continue;
        }
        const externalId = shopifyExternalOrderId(conn.shopDomain, so.id);
        const mapped = buildShopifyOrderPayload(conn.shopDomain, so, ctx);

        const existing = await Order.findOne({
          orderId: externalId,
          $or: [{ createdBy: req.user!._id }, { ownerUserId: req.user!._id }, { dropshipperId: req.user!._id }],
        });
        if (existing) {
          mergeShopifyPayloadIntoOrder(existing, mapped, Boolean(so.cancelled_at));
          existing.createdBy = req.user!._id;
          existing.ownerUserId = req.user!._id;
          if (ctx.dropshipperId) existing.dropshipperId = ctx.dropshipperId;
          if (ctx.vendorId) existing.vendorId = ctx.vendorId;
          await existing.save();
          updated++;
        } else {
          await Order.create(mapped);
          inserted++;
        }
      } catch {
        skipped++;
      }
    }

    conn.lastSyncedAt = new Date();
    conn.lastSyncError =
      skipped > 0 ? `${skipped} order(s) skipped due to mapping or save errors` : undefined;
    conn.syncCount = (conn.syncCount ?? 0) + 1;
    await conn.save();

    const { createInAppNotification } = await import("../services/inAppNotifications.js");
    await createInAppNotification(
      req.user._id,
      "shopify_sync",
      "Shopify orders synced",
      `${shopOrders.length} orders processed (${inserted} new, ${updated} updated).`,
      { shopDomain: conn.shopDomain, inserted, updated, skipped }
    );

    res.json({
      ok: true,
      synced: shopOrders.length,
      inserted,
      updated,
      skipped,
      lastSyncedAt: conn.lastSyncedAt,
      lastSyncError: conn.lastSyncError ?? null,
    });
  } finally {
    syncInFlight.delete(lockKey);
  }
});

/** Admin: list all Shopify store connections (no tokens). */
export const listConnectionsAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const rows = await ShopifyStoreConnection.find().sort({ updatedAt: -1 }).lean();
  res.json({
    connections: rows.map((r) => ({
      id: String(r._id),
      ownerUserId: String(r.ownerUserId),
      shopDomain: r.shopDomain,
      role: r.role,
      isActive: r.isActive,
      scope: r.scope,
      installedAt: r.installedAt,
      lastSyncedAt: r.lastSyncedAt ?? null,
      syncCount: r.syncCount ?? 0,
      lastSyncError: r.lastSyncError ?? null,
      disconnectedAt: r.disconnectedAt ?? null,
    })),
  });
});

function verifyShopifyWebhookHmac(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(hmacHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function webhookDeliveryId(raw: Buffer, topic: string, shopDomain: string, headerWebhookId: string): string {
  const trimmed = headerWebhookId.trim();
  if (trimmed) return `shopify-wh:${trimmed}`;
  const h = createHash("sha256").update(raw).update(`|${topic}|${shopDomain}|`).digest("hex");
  return `shopify-wh:noid-${h}`;
}

async function claimWebhookDelivery(
  deliveryId: string,
  topic: string,
  shopDomain: string
): Promise<"claimed" | "duplicate"> {
  try {
    await ShopifyWebhookReceipt.create({
      deliveryId,
      topic,
      shopDomain,
      expiresAt: defaultWebhookReceiptExpiry(),
    });
    return "claimed";
  } catch (e: unknown) {
    if (isMongoDuplicateKey(e)) return "duplicate";
    throw e;
  }
}

/** POST raw body — register before express.json in app.ts */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret) {
    res.status(503).send("Shopify not configured");
    return;
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const topic = (req.get("X-Shopify-Topic") || "").toLowerCase();
  const shopDomain = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase().trim();
  const headerWebhookId = req.get("X-Shopify-Webhook-Id") || "";

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).send("Invalid body");
    return;
  }
  const raw = req.body;

  if (!verifyShopifyWebhookHmac(raw, hmacHeader, apiSecret)) {
    res.status(401).send("Unauthorized");
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).send("Invalid JSON");
    return;
  }

  const deliveryId = webhookDeliveryId(raw, topic, shopDomain, headerWebhookId);

  try {
    if (topic === "app/uninstalled") {
      const claimed = await claimWebhookDelivery(deliveryId, topic, shopDomain);
      if (claimed === "duplicate") {
        res.status(200).send("OK");
        return;
      }
      try {
        const domain =
          shopDomain ||
          String(payload.myshopify_domain || payload.domain || "")
            .toLowerCase()
            .trim();
        if (domain) {
          const revoked = encrypt("");
          await ShopifyStoreConnection.updateMany(
            { shopDomain: domain },
            {
              isActive: false,
              disconnectedAt: new Date(),
              lastSyncError: "app_uninstalled",
              accessTokenEncrypted: revoked,
            }
          );
        }
        res.status(200).send("OK");
      } catch (inner: unknown) {
        await ShopifyWebhookReceipt.deleteOne({ deliveryId }).catch(() => undefined);
        throw inner;
      }
      return;
    }

    const isOrderTopic =
      topic === "orders/create" || topic === "orders/updated" || topic === "orders/cancelled";
    if (!isOrderTopic) {
      res.status(200).send("OK");
      return;
    }

    const conn = await ShopifyStoreConnection.findOne({ shopDomain, isActive: true });
    if (!conn) {
      res.status(200).send("OK");
      return;
    }

    const so = payload as unknown as ShopifyOrder;
    if (!so?.id) {
      res.status(200).send("OK");
      return;
    }

    const ctx: ShopifySyncUserContext = {
      ownerUserId: conn.ownerUserId,
      createdBy: conn.ownerUserId,
      dropshipperId: conn.role === "dropshipper" ? conn.ownerUserId : undefined,
      vendorId:
        conn.role === "vendor"
          ? (await Vendor.findOne({ userId: conn.ownerUserId }).select("_id").lean())?._id
          : undefined,
    };
    const mapped = buildShopifyOrderPayload(shopDomain || conn.shopDomain, so, ctx);
    const externalId = String(mapped.orderId);
    const cancelled = topic === "orders/cancelled" || Boolean(so.cancelled_at);

    const existing = await Order.findOne({ orderId: externalId });
    if (existing) {
      const owned =
        String(existing.ownerUserId ?? "") === String(conn.ownerUserId) ||
        String(existing.createdBy ?? "") === String(conn.ownerUserId) ||
        String(existing.dropshipperId ?? "") === String(conn.ownerUserId) ||
        (conn.role === "vendor" &&
          existing.vendorId &&
          String(existing.vendorId) === String(ctx.vendorId ?? ""));
      if (!owned) {
        res.status(200).send("OK");
        return;
      }
    } else if (cancelled) {
      res.status(200).send("OK");
      return;
    }

    const claimed = await claimWebhookDelivery(deliveryId, topic, shopDomain);
    if (claimed === "duplicate") {
      res.status(200).send("OK");
      return;
    }
    const dedupeInserted = true;

    try {
      if (existing) {
        mergeShopifyPayloadIntoOrder(existing, mapped, cancelled);
        await existing.save();
      } else {
        await Order.create(mapped);
      }
      conn.lastSyncedAt = new Date();
      await conn.save();
      res.status(200).send("OK");
    } catch (inner: unknown) {
      if (dedupeInserted) {
        await ShopifyWebhookReceipt.deleteOne({ deliveryId }).catch(() => undefined);
      }
      throw inner;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "webhook_error";
    console.error("[shopify] webhook failure", { topic, shopDomain, deliveryId, message: msg });
    res.status(500).send("Error");
  }
}
