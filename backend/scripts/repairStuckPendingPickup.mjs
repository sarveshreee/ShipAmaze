/**
 * One-off: pull Velocity tracking for stuck AWBs and advance order.status
 * so they leave Pending Pickup when courier is already in transit.
 *
 * Usage: node scripts/repairStuckPendingPickup.mjs [awb ...]
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Order } from "../src/models/Order.js";
import * as velocityService from "../src/modules/velocity/velocity.service.js";
import { mapVelocityStatus, shouldApplyInternalStatusUpdate } from "../src/modules/velocity/velocity.mapper.js";
import { normalizeOrderStatus } from "../src/utils/orderStatus.js";

const DEFAULT_AWBS = ["VETC0167795187", "VETC0339152368"];
const awbs = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_AWBS).map((a) =>
  String(a).trim().toUpperCase()
);

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze");

for (const awb of awbs) {
  const order =
    (await Order.findOne({ awb: new RegExp(`^${awb}$`, "i") }).exec()) ||
    (await Order.findOne({ awb }).exec());

  if (!order) {
    console.error(`[miss] no order for AWB ${awb}`);
    continue;
  }

  console.log(
    `[before] ${order.orderId} awb=${order.awb} status=${order.status} shipmentStatus=${order.shipmentStatus}`
  );

  let track;
  try {
    track = await velocityService.trackShipment({ awb: String(order.awb).trim() });
  } catch (err) {
    console.error(`[track-fail] ${awb}:`, err instanceof Error ? err.message : err);
    continue;
  }

  const raw = track?.status;
  let mapped = mapVelocityStatus(raw);
  let canonical = normalizeOrderStatus(mapped);
  const currentCanonical = normalizeOrderStatus(order.status);

  // Same safeguard as bg sync: unmapped/draft while booked → treat as in transit when pickup exists
  if (
    canonical === "draft" &&
    raw &&
    (track.pickup_date ||
      currentCanonical === "pickup_scheduled" ||
      currentCanonical === "picked_up" ||
      currentCanonical === "ready_to_ship")
  ) {
    mapped = "in-transit";
    canonical = "in_transit";
  }

  // If courier already confirmed pickup but status still maps to booking, advance
  if (
    track.pickup_date &&
    (canonical === "pickup_scheduled" || canonical === "ready_to_ship" || canonical === "draft")
  ) {
    mapped = "in-transit";
    canonical = "in_transit";
  }

  order.shipmentStatus = raw || order.shipmentStatus;
  if (Array.isArray(track.shipment_track_activities) && track.shipment_track_activities.length) {
    order.trackingActivities = track.shipment_track_activities;
  }
  if (track.pickup_date) {
    const ms = Date.parse(track.pickup_date);
    if (!Number.isNaN(ms)) order.pickupDate = new Date(ms);
  }

  if (shouldApplyInternalStatusUpdate(order.status, canonical) && currentCanonical !== canonical) {
    const prev = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory = [...prev, { status: canonical, at: new Date(), note: "repair_stuck_pending_pickup" }].slice(
      -50
    );
    order.status = canonical;
  }

  order.lastVelocityStatusSyncedAt = new Date();
  await order.save();

  console.log(
    `[after]  ${order.orderId} velocityRaw=${raw} mapped=${mapped} status=${order.status} shipmentStatus=${order.shipmentStatus} pickup=${track.pickup_date || "-"}`
  );
}

await mongoose.disconnect();
