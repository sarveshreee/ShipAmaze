import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";
import { OrderSkuAudit } from "../src/models/OrderSkuAudit.js";
import * as velocityService from "../src/modules/velocity/velocity.service.js";

const numericId = process.argv[2] || "6946810757314";

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

const order =
  (await Order.findOne({ shopifyOrderNumericId: numericId }).exec()) ||
  (await Order.findOne({ orderId: { $regex: `${numericId}$` } }).exec());

if (!order) {
  console.error("Order not found for", numericId);
  process.exit(1);
}

console.log("Found:", order.orderId, "status=", order.status, "awb=", order.awb);

const awb = String(order.awb ?? "").trim();
if (awb) {
  try {
    await velocityService.cancelShipment({ awbs: [awb] });
    console.log("Velocity shipment cancelled for AWB", awb);
  } catch (err) {
    console.warn("Velocity cancel skipped:", err instanceof Error ? err.message : err);
  }
}

await OrderSkuAudit.deleteMany({ orderId: order.orderId });
await order.deleteOne();
console.log("Deleted order", order.orderId);

await mongoose.disconnect();
