import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { isVelocityEnabledFlag, redactMongoUri, validateEnv } from "./config/env.js";
import { getMailTransportStatus } from "./services/mail.js";
import { devLog } from "./utils/devLog.js";

validateEnv();

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI!.trim();

async function main() {
  await connectDb(MONGODB_URI);
  const app = createApp();
  const server = http.createServer(app);

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
      devLog.info("[server] Transactional email: Brevo HTTP API (Render-compatible)");
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
