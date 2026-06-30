import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { isVelocityEnabledFlag, isVelocityConfigured, redactMongoUri, validateEnv } from "./config/env.js";
import { getMailTransportStatus } from "./services/mail.js";
import { brevoApiKeyHint, isLikelyBrevoV3ApiKey } from "./services/email/emailApiTransport.js";
import { devLog } from "./utils/devLog.js";
import { ShopifyStoreConnection } from "./models/ShopifyStoreConnection.js";
import { performShopifyOrderSyncForUser } from "./services/shopifySyncRunner.js";
import { Courier } from "./models/Courier.js";
import { syncActiveShipmentStatuses } from "./modules/velocity/velocity.statusSync.js";
import { syncNdrFromVelocity } from "./modules/velocity/velocity.ndrSync.js";

validateEnv();

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI!.trim();

const DEFAULT_COURIERS = [
  { name: "Delhivery",   active: true, priority: 1, codSupport: true,  carrierId: "" },
  { name: "DTDC",        active: true, priority: 2, codSupport: true,  carrierId: "" },
  { name: "BlueDart",    active: true, priority: 3, codSupport: true,  carrierId: "" },
  { name: "Amazon",      active: true, priority: 4, codSupport: false, carrierId: "" },
  { name: "Ekart",       active: true, priority: 5, codSupport: true,  carrierId: "" },
  { name: "Shadowfax",   active: true, priority: 6, codSupport: false, carrierId: "" },
  { name: "Xpressbees",  active: true, priority: 7, codSupport: true,  carrierId: "" },
];

async function seedDefaultCouriers() {
  const count = await Courier.countDocuments();
  if (count === 0) {
    await Courier.insertMany(DEFAULT_COURIERS);
    devLog.info("[server] Seeded 7 default couriers (Delhivery, DTDC, BlueDart, Amazon, Ekart, Shadowfax, Xpressbees)");
  }
}

async function main() {
  await connectDb(MONGODB_URI);
  await seedDefaultCouriers();
  const app = createApp();
  const server = http.createServer(app);

  let _retrying = false;
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (_retrying) return;
      _retrying = true;
      devLog.warn(`[server] Port ${PORT} in use, retrying in 1.5 s…`);
      setTimeout(() => {
        _retrying = false;
        server.close();
        server.listen(PORT);
      }, 1500);
    } else {
      console.error("[server] Unhandled server error", err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    const mongoSafe = redactMongoUri(MONGODB_URI);
    devLog.info(`[server] listening on port ${PORT}`);
    devLog.info(`[server] MongoDB: ${mongoSafe}`);
    devLog.info(`[server] CORS origins: ${process.env.CORS_ORIGIN ?? "(dev: permissive if unset)"}`);
    devLog.info(`[server] JWT: ${process.env.JWT_SECRET?.trim() ? "configured" : "missing (dev fallback may apply)"}`);
    devLog.info(
      `[server] ENCRYPTION_SECRET: ${process.env.ENCRYPTION_SECRET?.trim() ? "configured" : "missing (dev may use JWT for key derivation)"}`
    );
    const mailMode = getMailTransportStatus();
    if (mailMode === "brevo") {
      const key = process.env.BREVO_API_KEY?.trim() ?? "";
      const hint = brevoApiKeyHint(key);
      if (hint) {
        devLog.warn(`[server] Brevo email: ${hint}`);
      } else if (!isLikelyBrevoV3ApiKey(key)) {
        devLog.warn("[server] Brevo email: API key format could not be validated.");
      } else {
        devLog.info("[server] Transactional email: Brevo HTTP API (Render-compatible)");
      }
    } else if (mailMode === "resend") {
      devLog.info("[server] Transactional email: Resend HTTP API (Render-compatible)");
    } else if (mailMode === "gmail") {
      devLog.info("[server] Transactional email: Gmail SMTP (works locally; blocked on Render free tier)");
    } else if (mailMode === "smtp") {
      devLog.info("[server] Transactional email: custom SMTP (blocked on Render free tier)");
    } else {
      devLog.warn(
        "[server] Transactional email: not configured. For Render production set BREVO_API_KEY or RESEND_API_KEY. For local dev use EMAIL_FROM + EMAIL_PASS."
      );
    }
    devLog.info(`[server] Shopify OAuth redirect: ${process.env.SHOPIFY_REDIRECT_URI?.trim() ? "configured" : "(set SHOPIFY_REDIRECT_URI)"} (merchants use their own app Client ID/Secret)`);
    if (isVelocityEnabledFlag()) {
      devLog.info(`[server] Velocity: enabled (credentials ${process.env.VELOCITY_USERNAME?.trim() ? "set" : "missing"})`);
    } else {
      devLog.info(`[server] Velocity: not enabled (set VELOCITY_ENABLED=true to require credentials in production)`);
    }
    if (process.env.NODE_ENV === "production") {
      console.info(`[server] ShipAmaze API ready on port ${PORT}`);
    }
  });

  // Background Velocity shipment status sync — runs every 5 minutes.
  // Updates `status`, `shipmentStatus`, `pickupDate`, and `edd` for all active AWB orders
  // so that In Transit / Out for Delivery / Delivered tabs and EDD stay current automatically.
  // Runs whenever Velocity credentials are configured (VELOCITY_USERNAME + VELOCITY_PASSWORD),
  // regardless of the VELOCITY_ENABLED flag so dev/staging environments sync correctly too.
  const velocityBgSync = setInterval(async () => {
    try {
      if (!isVelocityConfigured()) return;
      const r = await syncActiveShipmentStatuses(150);
      devLog.info(
        `[velocity:bg-sync] processed=${r.processed} updated=${r.updated} errors=${r.errors} skipped=${r.skipped}`
      );
    } catch (e: unknown) {
      devLog.warn("[velocity:bg-sync] error", e instanceof Error ? e.message : e);
    }
  }, 5 * 60 * 1000);
  velocityBgSync.unref();

  // Run an initial sync 30 seconds after startup so statuses are fresh on first page load.
  if (isVelocityConfigured()) {
    setTimeout(async () => {
      try {
        const r = await syncActiveShipmentStatuses(150);
        devLog.info(
          `[velocity:startup-sync] processed=${r.processed} updated=${r.updated} errors=${r.errors} skipped=${r.skipped}`
        );
      } catch (e: unknown) {
        devLog.warn("[velocity:startup-sync] error", e instanceof Error ? e.message : e);
      }
      try {
        const ndr = await syncNdrFromVelocity({ daysBack: 120 });
        devLog.info(
          `[velocity:ndr-startup-sync] fetched=${ndr.fetched} upserted=${ndr.upserted} closed=${ndr.closed} errors=${ndr.errors}`
        );
      } catch (e: unknown) {
        devLog.warn("[velocity:ndr-startup-sync] error", e instanceof Error ? e.message : e);
      }
    }, 30_000).unref();
  }

  // Background NDR sync — runs every 10 minutes alongside status sync.
  const velocityNdrSync = setInterval(async () => {
    try {
      if (!isVelocityConfigured()) return;
      const ndr = await syncNdrFromVelocity({ daysBack: 120 });
      devLog.info(
        `[velocity:ndr-bg-sync] fetched=${ndr.fetched} upserted=${ndr.upserted} closed=${ndr.closed} errors=${ndr.errors}`
      );
    } catch (e: unknown) {
      devLog.warn("[velocity:ndr-bg-sync] error", e instanceof Error ? e.message : e);
    }
  }, 10 * 60 * 1000);
  velocityNdrSync.unref();

  // Background Shopify order sync — runs every 5 minutes as a fallback for any webhook misses
  const shopifyBgSync = setInterval(async () => {
    try {
      const connections = await ShopifyStoreConnection.find({ isActive: true }).lean();
      devLog.info(`[shopify:bg-sync] running for ${connections.length} active connection(s)`);
      for (const conn of connections) {
        await performShopifyOrderSyncForUser(conn.ownerUserId, conn.role as "vendor" | "dropshipper" | "admin", {
          shopDomain: conn.shopDomain,
        }).catch((e: unknown) => {
          devLog.warn("[shopify:bg-sync] sync failed for", String(conn.ownerUserId), e instanceof Error ? e.message : e);
        });
      }
    } catch (e: unknown) {
      devLog.warn("[shopify:bg-sync] background sync error", e instanceof Error ? e.message : e);
    }
  }, 5 * 60 * 1000);
  shopifyBgSync.unref();

  const shutdown = (signal: string) => {
    devLog.info(`[server] ${signal} received, shutting down…`);
    server.close((closeErr) => {
      if (closeErr) console.error("[server] HTTP close error", closeErr);
      void disconnectDb()
        .then(() => {
          process.exit(0);
        })
        .catch((e) => {
          console.error("[server] Mongo disconnect error", e);
          process.exit(1);
        });
    });
    setTimeout(() => {
      console.error("[server] forced exit after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
