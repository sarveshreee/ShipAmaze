import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

const patterns = ["6862840866746", "5952840855746", "6562840866746"];
for (const p of patterns) {
  const rows = await Order.find({
    $or: [
      { shopifyOrderNumericId: p },
      { orderId: { $regex: `${p}$` } },
      { externalOrderName: { $regex: p } },
    ],
  }).lean();
  if (rows.length) console.log(p, rows.map((r) => ({ orderId: r.orderId, status: r.status, shipmentStatus: r.shipmentStatus, awb: r.awb })));
}

const ready = await Order.find({
  isJunk: { $ne: true },
  $and: [
    { $or: [{ awb: { $exists: false } }, { awb: "" }, { awb: null }] },
    { $or: [{ status: "ready_to_ship" }, { shipmentStatus: "ready_to_ship" }, { status: "pending" }] },
  ],
})
  .select("orderId status shipmentStatus awb externalOrderName shopifyOrderNumericId customer")
  .limit(15)
  .lean();

console.log("\nReady-to-ship candidates:");
for (const r of ready) {
  console.log(r.shopifyOrderNumericId, r.orderId, r.status, r.shipmentStatus, r.customer);
}

await mongoose.disconnect();
