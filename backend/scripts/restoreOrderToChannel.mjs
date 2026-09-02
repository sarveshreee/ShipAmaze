import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";

const numericId = process.argv[2] || "6090964467852";
const dryRun = process.argv.includes("--dry-run");

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

const order =
  (await Order.findOne({ shopifyOrderNumericId: numericId }).exec()) ||
  (await Order.findOne({ orderId: { $regex: `${numericId}$` } }).exec()) ||
  (await Order.findOne({ externalOrderName: new RegExp(`#?${numericId}`, "i") }).exec());

if (!order) {
  console.error("Order not found for", numericId);
  process.exit(1);
}

console.log("Found order:");
console.log({
  orderId: order.orderId,
  externalOrderName: order.externalOrderName,
  shopifyOrderNumericId: order.shopifyOrderNumericId,
  status: order.status,
  shipmentStatus: order.shipmentStatus,
  awb: order.awb,
  shipmentCreated: order.shipmentCreated,
  channel: order.channel,
});

if (dryRun) {
  console.log("\nDry run — no changes applied.");
  await mongoose.disconnect();
  process.exit(0);
}

// Clear partial booking / shipment state (same fields as clearOrderShipmentForRebook)
order.shipmentCreated = false;
order.awb = "";
order.trackingId = undefined;
order.shipmentId = undefined;
order.velocityOrderId = undefined;
order.velocityShipmentId = undefined;
order.velocityReturnId = undefined;
order.lorrigoOrderId = undefined;
order.lorrigoShipmentId = undefined;
order.labelUrl = undefined;
order.manifestUrl = undefined;
order.courierCompanyId = undefined;
order.shippingCharges = undefined;
order.velocityFreightCost = undefined;
order.codCharges = undefined;
order.rtoCharges = undefined;
order.trackingUrl = undefined;
order.trackingActivities = undefined;
order.bookingInProgress = false;
order.movedToReadyAt = undefined;

const prevStatus = order.status;
const prevShipmentStatus = order.shipmentStatus;
order.status = "pending";
order.shipmentStatus = "pending";

if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
order.statusHistory.push({
  status: "pending",
  at: new Date(),
  note: `Restored to Channel tab from "${prevStatus}" / "${prevShipmentStatus}" (script)`,
});

await order.save();

console.log("\nRestored to Channel (pending):");
console.log({
  orderId: order.orderId,
  status: order.status,
  shipmentStatus: order.shipmentStatus,
  awb: order.awb,
  shipmentCreated: order.shipmentCreated,
});

await mongoose.disconnect();
