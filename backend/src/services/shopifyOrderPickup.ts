import type { Types } from "mongoose";
import type { UserRole } from "../models/User.js";
import type { IPickup } from "../models/Pickup.js";
import { Pickup } from "../models/Pickup.js";
import { PICKUP_ACTIVE, PICKUP_NOT_DELETED } from "../utils/pickupQuery.js";
import { buildPickupSnapshotFromLean } from "../utils/pickupSnapshot.js";

function pickupOwnerFilter(ownerUserId: Types.ObjectId, role: UserRole): Record<string, unknown> {
  if (role === "dropshipper") {
    return { $or: [{ userId: ownerUserId }, { dropshipperId: ownerUserId }] };
  }
  return { userId: ownerUserId };
}

/**
 * True when Shopify sync may attach the account's saved default pickup without clobbering
 * an existing manual or imported pickup snapshot.
 */
export function shopifyOrderNeedsDefaultPickup(order: {
  pickupAddressId?: Types.ObjectId | null;
  pickupAddress?: unknown;
}): boolean {
  if (order.pickupAddressId != null && String(order.pickupAddressId).length > 0) return false;
  const p = order.pickupAddress;
  if (p == null) return true;
  if (typeof p === "string") return p.trim().length === 0;
  if (typeof p !== "object" || Array.isArray(p)) return true;
  const o = p as Record<string, unknown>;
  const label = String(o.label ?? "").trim();
  const address = String(o.address ?? "").trim();
  const addr1 = String(o.address1 ?? "").trim();
  const pin = String(o.pincode ?? "").replace(/\D/g, "");
  const city = String(o.city ?? "").trim();
  const vel = String(o.velocityWarehouseId ?? "").trim();
  if (label || address || addr1) return false;
  if (pin.length >= 6 && city) return false;
  if (vel) return false;
  return true;
}

export async function findDefaultOrFirstActivePickupForShopifyOwner(
  ownerUserId: Types.ObjectId,
  role: UserRole
): Promise<IPickup | null> {
  const owner = pickupOwnerFilter(ownerUserId, role);
  const common: Record<string, unknown>[] = [owner, { ...PICKUP_NOT_DELETED }, { ...PICKUP_ACTIVE }];

  const def = await Pickup.findOne({
    $and: [...common, { isDefault: true }],
  })
    .sort({ updatedAt: -1 })
    .exec();
  if (def) return def;

  return Pickup.findOne({ $and: common }).sort({ createdAt: 1 }).exec();
}

export type ShopifyPickupApplyTarget = {
  pickupAddress?: unknown;
  pickupAddressId?: Types.ObjectId | null;
  pickupWarehouseId?: string;
  velocityWarehouseId?: string;
};

/**
 * Apply a pre-fetched pickup row when the order still has no usable pickup (Shopify sync).
 * @returns true if pickup fields were written
 */
export function applyCachedDefaultPickupIfMissingForShopify(
  target: ShopifyPickupApplyTarget,
  pickup: IPickup | null
): boolean {
  if (!pickup || !shopifyOrderNeedsDefaultPickup(target)) return false;

  const { snapshot, velocityWarehouseId } = buildPickupSnapshotFromLean(pickup, pickup._id);
  target.pickupAddress = snapshot;
  target.pickupAddressId = pickup._id;
  target.pickupWarehouseId = String(pickup._id);
  const v = velocityWarehouseId?.trim();
  if (v && !String(target.velocityWarehouseId ?? "").trim()) {
    target.velocityWarehouseId = v;
  }
  return true;
}

/**
 * When a Shopify order has no usable pickup, assign default (or first active) saved pickup
 * for the store owner. Does not overwrite existing pickup fields.
 * @returns true if a pickup was applied
 */
export async function applyDefaultPickupIfMissingForShopify(
  target: ShopifyPickupApplyTarget,
  ownerUserId: Types.ObjectId,
  role: UserRole
): Promise<boolean> {
  const pickup = await findDefaultOrFirstActivePickupForShopifyOwner(ownerUserId, role);
  return applyCachedDefaultPickupIfMissingForShopify(target, pickup);
}
