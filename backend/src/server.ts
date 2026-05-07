import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { isSmtpReady } from "./services/mail.js";

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET?.trim()) {
    throw new Error("JWT_SECRET is required in production");
  }
  await connectDb(MONGODB_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`🗄️ DB: ${MONGODB_URI}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🔗 CORS: ${process.env.CORS_ORIGIN}`);
    console.log(`🔐 JWT: ${process.env.JWT_SECRET?.trim() ? "configured" : "missing (dev fallback may apply)"}`);
    console.log(`🛡️ ENC: ${process.env.ENCRYPTION_SECRET?.trim() ? "configured" : "missing"}`);
    console.log(`📧 Password-reset email: ${isSmtpReady() ? "SMTP configured" : "not configured (codes only in server log)"}`);
    console.log(`🛍️ Shopify API: ${process.env.SHOPIFY_API_KEY?.trim() ? "configured" : "missing"}`);
    console.log(`📦 Scopes: ${process.env.SHOPIFY_SCOPES || "(unset)"}`);
    console.log(`↩️ Redirect: ${process.env.SHOPIFY_REDIRECT_URI || "(unset)"}`);
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
