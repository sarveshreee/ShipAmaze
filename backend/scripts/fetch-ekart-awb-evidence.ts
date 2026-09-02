/**
 * One-off: fetch order + Ekart track evidence for an AWB (no secrets printed).
 * Usage: npx tsx scripts/fetch-ekart-awb-evidence.ts TECP4381691430
 */
import "dotenv/config";
import mongoose from "mongoose";

const AWB = process.argv[2]?.trim() || "TECP4381691430";

async function main() {
  const base = (process.env.EKART_BASE_URL || "https://api.ekartlogistics.com").replace(/\/$/, "");
  const rawAuth = process.env.EKART_AUTHORIZATION?.trim() || "";
  const authHdr = /^basic\s+/i.test(rawAuth) ? rawAuth : `Basic ${rawAuth}`;
  const merchant = (process.env.EKART_MERCHANT_CODE || "").trim();

  console.log("=== CONFIG (no secrets) ===");
  console.log(JSON.stringify({ baseUrl: base, merchant, ekartEnabled: process.env.EKART_ENABLED }, null, 2));

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    const col = mongoose.connection.collection("orders");
    const order = await col.findOne({
      $or: [{ awb: AWB }, { ekartTrackingId: AWB }],
    });
    if (order) {
      console.log("\n=== ORDER FROM DB ===");
      console.log(
        JSON.stringify(
          {
            orderId: order.orderId,
            awb: order.awb,
            ekartTrackingId: order.ekartTrackingId,
            ekartRequestId: order.ekartRequestId,
            ekartClientReferenceId: order.ekartClientReferenceId,
            courierProvider: order.courierProvider,
            courierName: order.courierName,
            shipmentCreated: order.shipmentCreated,
            shipmentStatus: order.shipmentStatus,
            status: order.status,
            pickupAddressId: order.pickupAddressId,
            shippingAddress1: order.shippingAddress1 ?? order.address,
            shippingAddress2: order.shippingAddress2,
            paymentMode: order.paymentMode,
            orderAmount: order.orderAmount,
            weight: order.weight,
            length: order.length,
            width: order.width,
            height: order.height,
            items: order.items,
            productName: order.productName,
            customerPhone: order.customerPhone ?? order.phone,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            providerEvents: order.providerEvents,
          },
          null,
          2
        )
      );

      if (order.pickupAddressId) {
        const pickup = await mongoose.connection.collection("pickups").findOne({
          _id: new mongoose.Types.ObjectId(String(order.pickupAddressId)),
        });
        if (pickup) {
          console.log("\n=== PICKUP FROM DB ===");
          console.log(
            JSON.stringify(
              {
                label: pickup.label,
                contactName: pickup.contactName,
                phone: pickup.phone,
                addressLine1: pickup.addressLine1,
                city: pickup.city,
                state: pickup.state,
                pincode: pickup.pincode,
                ekartLocationCode: pickup.ekartLocationCode,
              },
              null,
              2
            )
          );
        }
      }
    } else {
      console.log("\n=== ORDER FROM DB === not found for AWB", AWB);
    }
    await mongoose.disconnect();
  } else {
    console.log("\n=== ORDER FROM DB === skipped (no MONGO URI in .env)");
  }

  if (!rawAuth || !merchant) {
    console.log("\n=== EKART API === skipped (no credentials in .env)");
    return;
  }

  const authRes = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { Authorization: authHdr, HTTP_X_MERCHANT_CODE: merchant },
  });
  const authJson = (await authRes.json()) as { Authorization?: string; authorization?: string };
  const token = String(authJson.Authorization || authJson.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  console.log("\n=== AUTH RESPONSE ===");
  console.log(JSON.stringify({ status: authRes.status, hasToken: Boolean(token) }, null, 2));
  if (!token) return;

  const trackBody = { tracking_ids: [AWB] };
  console.log("\n=== TRACK REQUEST ===");
  console.log(
    JSON.stringify(
      {
        method: "POST",
        url: `${base}/v2/shipments/track`,
        headers: { HTTP_X_MERCHANT_CODE: merchant, Authorization: "Bearer ***", "Content-Type": "application/json" },
        body: trackBody,
      },
      null,
      2
    )
  );

  const trackRes = await fetch(`${base}/v2/shipments/track`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      HTTP_X_MERCHANT_CODE: merchant,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(trackBody),
  });
  const trackJson = await trackRes.json();
  console.log("\n=== TRACK RESPONSE ===");
  console.log(JSON.stringify({ status: trackRes.status, body: trackJson }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
