import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze";

async function main() {
  await connectDb(MONGODB_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`🗄️ DB: ${MONGODB_URI}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🔗 CORS: ${process.env.CORS_ORIGIN}`);
    console.log(`🔐 JWT: ${process.env.JWT_SECRET}`);
    console.log(`🛡️ ENC: ${process.env.ENCRYPTION_SECRET}`);
    console.log(`🛍️ API Key: ${process.env.SHOPIFY_API_KEY}`);
    console.log(`🔑 API Secret: ${process.env.SHOPIFY_API_SECRET}`);
    console.log(`📦 Scopes: ${process.env.SHOPIFY_SCOPES}`);
    console.log(`↩️ Redirect: ${process.env.SHOPIFY_REDIRECT_URI}`);
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
