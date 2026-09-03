/**
 * Heal specific Ekart cancel sync issues:
 * - 10332: Elite seller-cancel (rto:true) → move ShipAmaze to reship
 * - 10318: local reship without Durin cancel → call RTO on orphan AWB
 *
 * Usage: npx tsx scripts/heal-ekart-cancel-orders.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { cancelEkartShipment } from "../src/modules/ekart/ekart.cancel.js";
import { trackEkartShipment } from "../src/modules/ekart/ekart.tracking.js";
import { mapEkartStatusToProviderCanonical } from "../src/modules/courier/statusNormalize.js";

async function heal10332(col: mongoose.Collection) {
  const order = await col.findOne({ orderId: "10332" });
  if (!order) {
    console.log("10332 not found");
    return;
  }
  const awb = String(order.awb || order.ekartTrackingId || "TECP1694954267");
  const tracked = await trackEkartShipment({ awb });
  console.log("10332 track status=", tracked.status, "canonical=", mapEkartStatusToProviderCanonical(tracked.status));
  if (mapEkartStatusToProviderCanonical(tracked.status) !== "CANCELLED") {
    console.log("10332: track did not map to CANCELLED — check parser");
    return;
  }
  await col.updateOne(
    { orderId: "10332" },
    {
      $set: {
        status: "reship",
        shipmentStatus: "reship",
        shipmentCreated: false,
        awb: "",
        updatedAt: new Date(),
      },
      $unset: {
        ekartTrackingId: "",
        ekartRequestId: "",
        ekartClientReferenceId: "",
        courierProvider: "",
        courierName: "",
        trackingActivities: "",
        trackingUrl: "",
      },
      $push: {
        statusHistory: {
          status: "reship",
          at: new Date(),
          note: "heal_ekart_elite_seller_cancel_to_reship",
        },
        providerEvents: {
          provider: "ekart",
          type: "STATUS_CHANGE",
          timestamp: new Date(),
          status: "SUCCESS",
          message: "in_transit → reship (Ekart cancelled)",
          metadata: { providerCanonical: "CANCELLED", rawStatus: tracked.status, healed: true },
        },
      },
    }
  );
  console.log("10332 healed → reship");
}

async function heal10318(col: mongoose.Collection) {
  const order = await col.findOne({ orderId: "10318" });
  if (!order) {
    console.log("10318 not found");
    return;
  }
  const awb = "TECP0323497428";
  console.log("10318 calling Durin RTO cancel for", awb);
  const result = await cancelEkartShipment({
    awbs: [awb],
    merchantReferenceId: "10318",
    reason: "Cancel the shipment",
    serviceLeg: "FORWARD",
  });
  console.log("10318 cancel result=", result);
  const tracked = await trackEkartShipment({ awb });
  console.log("10318 after-cancel track status=", tracked.status, "rto canonical=", mapEkartStatusToProviderCanonical(tracked.status));
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("No mongo uri");
  await mongoose.connect(uri);
  const col = mongoose.connection.collection("orders");
  await heal10332(col);
  await heal10318(col);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
