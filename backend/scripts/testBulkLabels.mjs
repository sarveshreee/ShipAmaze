/**
 * Smoke-test bulk label resolution for pending-pickup orders (admin only).
 * Usage: npx tsx scripts/testBulkLabels.mjs [limit]
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";
import {
  createVelocityRefreshCache,
  resolveOrderLabelPdf,
} from "../src/modules/velocity/velocity.labelPdf.js";

const limit = Math.min(Number(process.argv[2] || 5), 25);
const specificIds = process.argv.slice(3);

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

const query =
  specificIds.length > 0
    ? { orderId: { $in: specificIds } }
    : {
        awb: { $exists: true, $nin: ["", null], $not: /^AWB-/ },
        velocityShipmentId: { $exists: true, $nin: ["", null] },
        $or: [
          { shipmentStatus: { $in: ["ready_for_pickup", "ready-to-ship", "ready_to_ship", "pending-pickup", "pending_pickup"] } },
          { status: { $in: ["ready_to_ship", "pending_pickup"] } },
        ],
      };

const orders = await Order.find(query).limit(limit).exec();

console.log(`Testing ${orders.length} orders...`);
const cache = createVelocityRefreshCache();
let ok = 0;
let fail = 0;

for (const order of orders) {
  try {
    const { buffer } = await resolveOrderLabelPdf(order, {
      allowVelocityRefresh: true,
      velocityRefreshCache: cache,
    });
    ok++;
    console.log(`OK  ${order.orderId} awb=${order.awb} bytes=${buffer.length}`);
  } catch (err) {
    fail++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL ${order.orderId} awb=${order.awb} — ${msg}`);
  }
}

console.log(`\nResult: ${ok} ok, ${fail} failed`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
