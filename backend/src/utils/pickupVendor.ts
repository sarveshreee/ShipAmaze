import mongoose, { type Types } from "mongoose";
import { Vendor } from "../models/Vendor.js";
import { Pickup } from "../models/Pickup.js";
import { PICKUP_NOT_DELETED } from "./pickupQuery.js";

type PickupVendorSource = {
  vendorId?: unknown;
  createdByRole?: string;
  userId?: unknown;
};

/** Resolve Vendor document id from a pickup row (vendor warehouse or legacy vendor user). */
export async function resolveVendorIdFromPickup(
  pickup: PickupVendorSource
): Promise<Types.ObjectId | undefined> {
  if (pickup.vendorId && mongoose.isValidObjectId(String(pickup.vendorId))) {
    return new mongoose.Types.ObjectId(String(pickup.vendorId));
  }
  if (pickup.createdByRole === "vendor" && pickup.userId) {
    const v = await Vendor.findOne({ userId: pickup.userId }).select("_id").lean();
    if (v?._id) return v._id as Types.ObjectId;
  }
  return undefined;
}

/** Pickup ids owned by this vendor user account. */
export async function vendorOwnedPickupIds(vendorUserId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const rows = await Pickup.find({
    $and: [{ userId: vendorUserId }, { ...PICKUP_NOT_DELETED }],
  })
    .select("_id")
    .lean();
  return rows.map((r) => r._id as Types.ObjectId);
}
