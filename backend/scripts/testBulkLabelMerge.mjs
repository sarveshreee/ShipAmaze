import "dotenv/config";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";
import { Order } from "../src/models/Order.js";
import {
  createVelocityRefreshCache,
  mapWithConcurrency,
  resolveOrderLabelPdf,
} from "../src/modules/velocity/velocity.labelPdf.js";

const limit = Math.min(Number(process.argv[2] || 22), 50);

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

const orders = await Order.find({
  awb: { $exists: true, $nin: ["", null], $not: /^AWB-/ },
  velocityShipmentId: { $exists: true, $nin: ["", null] },
  shopifyShopDomain: "qwerbf-hp.myshopify.com",
  $or: [{ status: "ready_to_ship" }, { shipmentStatus: "ready_for_pickup" }],
})
  .limit(limit)
  .exec();

console.log(`Bulk merge test for ${orders.length} orders`);
const refreshCache = createVelocityRefreshCache();
const started = Date.now();

const results = await mapWithConcurrency(orders, 8, async (order) => {
  try {
    const resolved = await resolveOrderLabelPdf(order, {
      allowVelocityRefresh: false,
      velocityRefreshCache: refreshCache,
    });
    return { ok: true, ...resolved };
  } catch {
    try {
      const resolved = await resolveOrderLabelPdf(order, {
        allowVelocityRefresh: true,
        velocityRefreshCache: refreshCache,
      });
      return { ok: true, ...resolved };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, orderId: order.orderId, message: msg };
    }
  }
});

const ok = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);
console.log(`Resolved ${ok.length}/${orders.length} in ${Date.now() - started}ms`);
if (failed.length) {
  console.log("Failures:", failed.slice(0, 5));
  process.exit(1);
}

const merged = await PDFDocument.create();
for (const row of ok) {
  const src = await PDFDocument.load(row.buffer);
  const pages = await merged.copyPages(src, src.getPageIndices());
  for (const page of pages) merged.addPage(page);
}
const bytes = await merged.save();
console.log(`Merged PDF: ${bytes.length} bytes, pages=${merged.getPageCount()}`);
console.log(
  "Sources:",
  ok.reduce(
    (acc, r) => {
      const k = r.source || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    {}
  )
);

await mongoose.disconnect();
