import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { isVelocityEnabledFlag, redactMongoUri, validateEnv } from "./config/env.js";
import { isSmtpReady } from "./services/mail.js";

validateEnv();

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI!.trim();

async function main() {
  await connectDb(MONGODB_URI);
  const app = createApp();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    const mongoSafe = redactMongoUri(MONGODB_URI);
    console.log(`[server] listening on port ${PORT}`);
    console.log(`[server] MongoDB: ${mongoSafe}`);
    console.log(`[server] CORS origins: ${process.env.CORS_ORIGIN ?? "(dev: permissive if unset)"}`);
    console.log(`[server] JWT: ${process.env.JWT_SECRET?.trim() ? "configured" : "missing (dev fallback may apply)"}`);
    console.log(`[server] ENCRYPTION_SECRET: ${process.env.ENCRYPTION_SECRET?.trim() ? "configured" : "missing (dev may use JWT for key derivation)"}`);
    console.log(`[server] Password-reset email: ${isSmtpReady() ? "SMTP configured" : "not configured (codes only in server log in dev)"}`);
    console.log(`[server] Shopify API: ${process.env.SHOPIFY_API_KEY?.trim() ? "configured" : "(not set)"}`);
    if (isVelocityEnabledFlag()) {
      console.log(`[server] Velocity: enabled (credentials ${process.env.VELOCITY_USERNAME?.trim() ? "set" : "missing"})`);
    } else {
      console.log(`[server] Velocity: not enabled (set VELOCITY_ENABLED=true to require credentials in production)`);
    }
  });

  const shutdown = (signal: string) => {
    console.info(`[server] ${signal} received, shutting down…`);
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
