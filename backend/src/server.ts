import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze";

async function main() {
  await connectDb(MONGODB_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`ShipAmaze API listening on http://localhost:${PORT}`);
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
