import type { Request, Response } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Types } from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { OAuthState, defaultOAuthStateExpiry } from "../models/OAuthState.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { ShopifyWebhookReceipt, defaultWebhookReceiptExpiry } from "../models/ShopifyWebhookReceipt.js";
import { Order } from "../models/Order.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import * as shopifyService from "../services/shopify.service.js";
import { ensureShopifyWebhooksRegistered } from "../services/shopifyWebhooks.js";
import { buildShopifyOrderPayload, mergeShopifyPayloadIntoOrder } from "../services/shopifyOrderSync.js";
import type { ShopifyOrder } from "../services/shopify.service.js";
import type { ShopifySyncUserContext } from "../services/shopifyOrderSync.js";
import {
  applyDefaultPickupIfMissingForShopify,
  type ShopifyPickupApplyTarget,
} from "../services/shopifyOrderPickup.js";
import { performShopifyOrderSyncForUser } from "../services/shopifySyncRunner.js";
import { devLog } from "../utils/devLog.js";

/* ------------------------------------------------------------------ */
/*  Env helpers (server URL + scopes; credentials come from each user)    */
/* ------------------------------------------------------------------ */
function oauthRedirectUri(): string {
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI?.trim();
  if (!redirectUri) {
    throw new AppError(
      500,
      "Shopify redirect URL is not configured. Set SHOPIFY_REDIRECT_URI in .env (e.g. http://localhost:5000/api/shopify/callback)."
    );
  }
  return redirectUri;
}

function oauthScopes(): string {
  return (
    process.env.SHOPIFY_SCOPES?.trim() ||
    "read_orders,write_orders,read_products,write_products,read_locations,write_locations,read_customers,write_customers"
  );
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
/*  State store: temporary OAuth state (MongoDB — multi-instance safe)   */
/* ------------------------------------------------------------------ */
const syncInFlight = new Set<string>();

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000;
}

async function createOAuthState(
  ownerUserId: string,
  shopDomain: string,
  shopifyApiKey: string,
  shopifyApiSecret: string
): Promise<string> {
  const state = randomBytes(16).toString("hex");
  await OAuthState.create({
    state,
    ownerUserId,
    shopDomain,
    shopifyApiKey: shopifyApiKey.trim(),
    shopifyApiSecretEncrypted: encrypt(shopifyApiSecret.trim()),
    expiresAt: defaultOAuthStateExpiry(),
  });
  return state;
}

type ConsumedOAuthState = {
  ownerUserId: string;
  shopDomain: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
};

/** Atomically consume state (one-time use) — safe across horizontal scaling. */
async function consumeOAuthState(state: string): Promise<ConsumedOAuthState> {
  const rec = await OAuthState.findOneAndDelete({
    state,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!rec) throw new AppError(400, "Invalid OAuth state");
  let shopifyApiSecret: string;
  try {
    shopifyApiSecret = decrypt(rec.shopifyApiSecretEncrypted);
  } catch {
    throw new AppError(400, "Invalid OAuth state");
  }
  return {
    ownerUserId: String(rec.ownerUserId),
    shopDomain: rec.shopDomain,
    shopifyApiKey: rec.shopifyApiKey,
    shopifyApiSecret,
  };
}

function readConnectCredentials(body: unknown): { shopifyApiKey: string; shopifyApiSecret: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const shopifyApiKey = String(b.shopifyApiKey ?? "").trim();
  const shopifyApiSecret = String(b.shopifyApiSecret ?? "").trim();
  if (!shopifyApiKey || !shopifyApiSecret) {
    throw new AppError(400, "shopifyApiKey and shopifyApiSecret are required (from your Shopify custom app).");
  }
  return { shopifyApiKey, shopifyApiSecret };
}

function isValidShopDomain(shop: string): boolean {
  const s = shop.trim().toLowerCase();
  return /^(?!-)[a-z0-9-]+(?<!-)\.myshopify\.com$/.test(s);
}

/** Accept "mystore", "mystore.myshopify.com", or full admin URLs. */
function normalizeShopInput(shop: string): string {
  let s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/$/, "");
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return s;
}

function buildOAuthAuthorizeUrl(shopDomain: string, state: string, shopifyApiKey: string): string {
  const redirectUri = oauthRedirectUri();
  const scopes = oauthScopes();
  return (
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(shopifyApiKey)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`
  );
}

async function resolveWebhookApiSecret(shopDomain: string): Promise<string | null> {
  const legacy = process.env.SHOPIFY_API_SECRET?.trim();
  const dbReady = ShopifyStoreConnection.db.readyState === 1;
  if (!shopDomain || !dbReady) {
    return legacy || null;
  }
  try {
    const conn = await ShopifyStoreConnection.findOne({ shopDomain, isActive: true })
      .select("shopifyApiSecretEncrypted")
      .lean();
    if (conn?.shopifyApiSecretEncrypted) {
      try {
        return decrypt(conn.shopifyApiSecretEncrypted);
      } catch {
        /* fall through */
      }
    }
  } catch {
    return legacy || null;
  }
  return legacy || null;
}

function parseQueryRecord(req: Request): Record<string, string> {
  const qraw = req.query as Record<string, unknown>;
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(qraw)) {
    const fv = firstQueryValue(v);
    if (fv !== undefined) query[k] = fv;
  }
  return query;
}

function firstQueryValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

/**
 * GET /api/shopify/install — optional entry from Shopify (redirects to Channels form).
 * Verifies Shopify's signed query, then sends the merchant to your web app to log in and connect.
 */
export const handleInstall = asyncHandler(async (req: Request, res: Response) => {
  const query = parseQueryRecord(req);
  const shopRaw = query.shop?.trim();
  if (!shopRaw) {
    res.redirect(buildFrontendRedirect("error", "Missing shop parameter from Shopify."));
    return;
  }

  const shopDomain = normalizeShopInput(shopRaw);
  if (!isValidShopDomain(shopDomain)) {
    res.redirect(buildFrontendRedirect("error", "Invalid shop domain from Shopify."));
    return;
  }

  const legacySecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (query.hmac && legacySecret && !verifyShopifyHmac(query, legacySecret)) {
    res.redirect(buildFrontendRedirect("error", "Could not verify request from Shopify."));
    return;
  }

  const frontendBaseUrl = resolveFrontendBaseUrl();
  const postConnectPath = process.env.SHOPIFY_POST_CONNECT_PATH || "/dropshipper/channels";
  const normalisedPath = postConnectPath.startsWith("/") ? postConnectPath : `/${postConnectPath}`;
  const u = new URL(`${frontendBaseUrl}${normalisedPath}`);
  u.searchParams.set("shop", shopDomain);
  u.searchParams.set("shopify_install", "1");
  res.redirect(u.toString());
});

/**
 * POST /api/shopify/connect?shop=xxx.myshopify.com
 * Body: { shopifyApiKey, shopifyApiSecret } — merchant's custom app credentials (importerr-style).
 */
export const initiateConnect = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const shopRaw =
    firstQueryValue((req.query as Record<string, unknown>).shop)?.trim() ||
    String(body.shop ?? body.storeDomain ?? "").trim();
  if (!shopRaw) {
    throw new AppError(400, "shop is required (query ?shop= or body.shop / storeDomain).");
  }

  const shopDomain = normalizeShopInput(shopRaw);
  if (!isValidShopDomain(shopDomain)) {
    throw new AppError(400, "Invalid shop domain. It must end with .myshopify.com (e.g. mystore.myshopify.com)");
  }

  const { shopifyApiKey, shopifyApiSecret } = readConnectCredentials(req.body);

  const existing = await ShopifyStoreConnection.findOne({
    ownerUserId: req.user._id,
    shopDomain,
    isActive: true,
  }).lean();
  if (existing?.accessTokenEncrypted) {
    try {
      const tok = decrypt(existing.accessTokenEncrypted);
      if (tok) {
        throw new AppError(
          400,
          "This Shopify store is already connected. Disconnect first to reconnect with new credentials."
        );
      }
    } catch (e: unknown) {
      if (e instanceof AppError) throw e;
      /* stale token — allow reconnect */
    }
  }

  const state = await createOAuthState(
    String(req.user._id),
    shopDomain,
    shopifyApiKey,
    shopifyApiSecret
  );
  const oauthUrl = buildOAuthAuthorizeUrl(shopDomain, state, shopifyApiKey);

  if (process.env.NODE_ENV === "development") {
    devLog.info("[shopify] oauth initiate (per-merchant app)", { shop: shopDomain });
  }

  res.json({ url: oauthUrl });
});

/* ------------------------------------------------------------------ */
/*  GET /api/shopify/callback (called by Shopify after OAuth)           */
/* ------------------------------------------------------------------ */
export const handleCallback = asyncHandler(async (req: Request, res: Response) => {
  const query = parseQueryRecord(req);
  const { code, shop, state } = query;

  if (!state) {
    devLog.warn("[shopify:oauth] callback missing state");
    res.redirect(buildFrontendRedirect("error", "Missing OAuth state. Start connect again from ShipAmaze."));
    return;
  }

  let oauthCtx: ConsumedOAuthState;
  try {
    oauthCtx = await consumeOAuthState(state);
  } catch {
    devLog.warn("[shopify:oauth] callback invalid/expired state");
    res.redirect(buildFrontendRedirect("error", "Session expired or invalid. Start connect again from ShipAmaze."));
    return;
  }

  const { ownerUserId, shopifyApiKey, shopifyApiSecret } = oauthCtx;

  if (!verifyShopifyHmac(query, shopifyApiSecret)) {
    if (process.env.NODE_ENV === "development") {
      devLog.warn("[shopify] oauth callback HMAC verification failed");
    }
    res.redirect(buildFrontendRedirect("error", "Could not verify OAuth callback (invalid signature)."));
    return;
  }

  if (!code || !shop) {
    devLog.warn("[shopify:oauth] callback missing code/shop");
    res.redirect(buildFrontendRedirect("error", "OAuth callback was missing code or shop."));
    return;
  }

  if (!isValidShopDomain(shop)) {
    devLog.warn("[shopify:oauth] callback invalid shop domain=", shop);
    res.redirect(buildFrontendRedirect("error", "Invalid shop domain in callback."));
    return;
  }

  const redirectUri = oauthRedirectUri();

  // Exchange code for access token (redirect_uri must match authorize request)
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: shopifyApiKey,
      client_secret: shopifyApiSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    devLog.warn("[shopify:oauth] token exchange failed status=", tokenRes.status);
    res.redirect(buildFrontendRedirect("error", "Token exchange with Shopify failed. Try again or reinstall the app."));
    return;
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };
  const { access_token, scope } = tokenData;
  if (process.env.NODE_ENV === "development") {
    devLog.info("[shopify] oauth token exchanged", { scope });
  }

  // Get shop details to verify
  const shopDetails = await shopifyService.getShopDetails(access_token, shop);

  // Fetch the user's role
  const { User } = await import("../models/User.js");
  const user = await User.findById(ownerUserId);
  if (!user) {
    devLog.warn("[shopify:oauth] owner user not found ownerUserId=", ownerUserId);
    res.redirect(buildFrontendRedirect("error", "User session no longer valid. Log in and connect again."));
    return;
  }

  const accessTokenEncrypted = encrypt(access_token);
  const apiSecretEncrypted = encrypt(shopifyApiSecret);

  // Upsert — one record per user+shop
  await ShopifyStoreConnection.findOneAndUpdate(
    { ownerUserId, shopDomain: shopDetails.myshopify_domain },
    {
      ownerUserId,
      shopDomain: shopDetails.myshopify_domain,
      shopifyApiKey,
      shopifyApiSecretEncrypted: apiSecretEncrypted,
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

  try {
    const wh = await ensureShopifyWebhooksRegistered(access_token, shopDetails.myshopify_domain);
    if (wh.deferredNonHttps) {
      devLog.info("[shopify] webhooks skipped (HTTPS required by Shopify; use Sync orders locally or set SHOPIFY_WEBHOOK_URL to https:// on Render)", {
        shop: shopDetails.myshopify_domain,
        address: wh.address,
      });
    } else if (process.env.NODE_ENV === "development") {
      devLog.info("[shopify] webhooks ensured", {
        shop: shopDetails.myshopify_domain,
        address: wh.address,
        registered: wh.registered,
        skipped: wh.skipped,
      });
    }
  } catch (whErr: unknown) {
    const msg = whErr instanceof Error ? whErr.message : "Webhook registration failed";
    devLog.warn("[shopify:oauth] webhook registration failed", {
      shop: shopDetails.myshopify_domain,
      message: msg,
    });
    await ShopifyStoreConnection.updateOne(
      { ownerUserId, shopDomain: shopDetails.myshopify_domain },
      { lastSyncError: `Webhook registration failed: ${msg.slice(0, 240)}` }
    );
  }

  const userRole = user.role as "admin" | "vendor" | "dropshipper";
  void performShopifyOrderSyncForUser(new Types.ObjectId(ownerUserId), userRole)
    .then((r) => {
      devLog.info("[shopify] initial order sync after connect", r);
    })
    .catch((syncErr: unknown) => {
      const msg = syncErr instanceof Error ? syncErr.message : "initial sync failed";
      devLog.warn("[shopify:oauth] initial order sync failed", { message: msg });
      void ShopifyStoreConnection.updateOne(
        { ownerUserId, shopDomain: shopDetails.myshopify_domain },
        { lastSyncError: `Initial sync failed: ${msg.slice(0, 200)}` }
      );
    });

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
    const { inserted, updated, skipped, synced, shopDomain, skipReasons } =
      await performShopifyOrderSyncForUser(
        req.user._id,
        req.user.role as "admin" | "vendor" | "dropshipper"
      );

    const conn = await ShopifyStoreConnection.findOne({
      ownerUserId: req.user._id,
      isActive: true,
    });

    const { createInAppNotification } = await import("../services/inAppNotifications.js");
    await createInAppNotification(
      req.user._id,
      "shopify_sync",
      "Shopify orders synced",
      `${synced} orders processed (${inserted} new, ${updated} updated).`,
      { shopDomain, inserted, updated, skipped }
    );

    if (synced > 0) {
      try {
        const { sendShopifySyncEmail } = await import("../services/email/emailService.js");
        await sendShopifySyncEmail({
          userId: req.user._id,
          shopDomain,
          synced,
          inserted,
          updated,
          skipped,
        });
      } catch {
        /* optional email */
      }
    }

    res.json({
      ok: true,
      synced,
      inserted,
      updated,
      skipped,
      skipReasons,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      lastSyncError: conn?.lastSyncError ?? null,
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
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const topic = (req.get("X-Shopify-Topic") || "").toLowerCase();
  const shopDomain = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase().trim();
  const headerWebhookId = req.get("X-Shopify-Webhook-Id") || "";

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).send("Invalid body");
    return;
  }
  const raw = req.body;

  const apiSecret = shopDomain ? await resolveWebhookApiSecret(shopDomain) : null;
  if (!apiSecret) {
    res.status(503).send("Shopify webhook secret not configured for this store");
    return;
  }

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
    const { normalizeShopifyOrderNumericId } = await import("../services/shopifyOrderSync.js");
    const numericId = normalizeShopifyOrderNumericId(so?.id);
    if (!so || numericId == null) {
      res.status(200).send("OK");
      return;
    }
    const soNormalized = { ...so, id: numericId };

    const ctx: ShopifySyncUserContext = {
      ownerUserId: conn.ownerUserId,
      createdBy: conn.ownerUserId,
      dropshipperId: conn.role === "dropshipper" ? conn.ownerUserId : undefined,
      vendorId:
        conn.role === "vendor"
          ? (await Vendor.findOne({ userId: conn.ownerUserId }).select("_id").lean())?._id
          : undefined,
    };
    const mapped = buildShopifyOrderPayload(shopDomain || conn.shopDomain, soNormalized, ctx);
    const externalId = String(mapped.orderId);
    const cancelled = topic === "orders/cancelled" || Boolean(soNormalized.cancelled_at);

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
        if (await applyDefaultPickupIfMissingForShopify(existing, conn.ownerUserId, conn.role)) {
          existing.markModified("pickupAddress");
        }
        await existing.save();
      } else {
        await applyDefaultPickupIfMissingForShopify(mapped as ShopifyPickupApplyTarget, conn.ownerUserId, conn.role);
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
