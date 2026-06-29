import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";
import { OrderSkuAudit } from "../src/models/OrderSkuAudit.js";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: npx tsx scripts/deleteOrdersByNumericIds.mjs <numericId> [...]");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

for (const numericId of ids) {
  const order =
    (await Order.findOne({ shopifyOrderNumericId: numericId }).exec()) ||
    (await Order.findOne({ orderId: { $regex: `${numericId}$` } }).exec());

  if (!order) {
    console.log("NOT FOUND:", numericId);
    continue;
  }

  console.log("Deleting:", order.orderId, "| status=", order.status, "| awb=", order.awb || "(none)");
  await OrderSkuAudit.deleteMany({ orderId: order.orderId });
  await order.deleteOne();
  console.log("  OK deleted");
}

await mongoose.disconnect();
