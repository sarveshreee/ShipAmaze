/**
 * One-off: force-sync RIGHT TRADERS pickup → Lorrigo.
 * Does NOT mutate local address/contact fields — only sets lorrigoPickupId / sync status.
 *
 * Usage: node --import tsx scripts/syncRightTradersLorrigo.mjs
 *    or: npx tsx scripts/syncRightTradersLorrigo.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Pickup } from "../src/models/Pickup.js";
import { syncPickupToLorrigo } from "../src/modules/lorrigo/lorrigo.pickupSync.js";
import { pickupToLorrigoPickupPayload } from "../src/modules/lorrigo/lorrigo.pickupSync.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

await mongoose.connect(uri);
console.info("[sync] connected");

const pickups = await Pickup.find({
  $and: [
    { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
    {
      $or: [
        { label: /RIGHT\s*TRADERS/i },
        { contactName: /RIGHT\s*TRADERS/i },
      ],
    },
  ],
})
  .select(
    "label contactName phone email addressLine1 addressLine2 city state pincode country lorrigoPickupId lorrigoSyncStatus lorrigoSyncError sourceWarehouseId"
  )
  .lean();

if (!pickups.length) {
  console.error("[sync] no RIGHT TRADERS pickup found");
  await mongoose.disconnect();
  process.exit(1);
}

for (const p of pickups) {
  console.info("----");
  console.info("[sync] found", {
    id: String(p._id),
    label: p.label,
    phone: p.phone,
    email: p.email,
    pincode: p.pincode,
    addressLen: String(p.addressLine1 ?? "").length,
    lorrigoPickupId: p.lorrigoPickupId,
    lorrigoSyncStatus: p.lorrigoSyncStatus,
    lorrigoSyncError: p.lorrigoSyncError,
  });
  const payload = pickupToLorrigoPickupPayload(p, String(p.email ?? ""));
  console.info("[sync] outbound payload (local address unchanged)", {
    facilityName: payload.facilityName,
    contactPersonName: payload.contactPersonName,
    phone: payload.phone,
    email: payload.email,
    pincode: payload.pincode,
    address: payload.address,
    addressLen: payload.address.length,
    city: payload.city,
    state: payload.state,
  });

  // Clear stale FAILED so force path always hits provider
  await Pickup.updateOne(
    { _id: p._id },
    {
      $unset: { lorrigoPickupId: 1 },
      $set: { lorrigoSyncStatus: "FAILED", lorrigoSyncError: "manual resync" },
    }
  );

  const result = await syncPickupToLorrigo(String(p._id), { force: true });
  console.info("[sync] result", result);

  const fresh = await Pickup.findById(p._id)
    .select("label addressLine1 lorrigoPickupId lorrigoSyncStatus lorrigoSyncError lorrigoLastSyncAt")
    .lean();
  console.info("[sync] after (address untouched)", {
    label: fresh?.label,
    addressLine1Preview: String(fresh?.addressLine1 ?? "").slice(0, 80),
    addressLine1Len: String(fresh?.addressLine1 ?? "").length,
    lorrigoPickupId: fresh?.lorrigoPickupId,
    lorrigoSyncStatus: fresh?.lorrigoSyncStatus,
    lorrigoSyncError: fresh?.lorrigoSyncError,
  });
}

await mongoose.disconnect();
console.info("[sync] done");
