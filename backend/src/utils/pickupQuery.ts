import type { Types } from "mongoose";
import type { IUser, UserRole } from "../models/User.js";
import { Pickup } from "../models/Pickup.js";
import { getPickupOwnerFilterForUser } from "./pickupOwnerFilter.js";

/** Mongo clause: all pickups belonging to this account (vendor or dropshipper user id). */
export function pickupOwnerScope(userId: Types.ObjectId, role: UserRole): Record<string, unknown> {
  if (role === "dropshipper") {
    return { $or: [{ userId }, { dropshipperId: userId }] };
  }
  return { userId };
}

/** Pickups that are not soft-deleted */
export const PICKUP_NOT_DELETED: Record<string, unknown> = {
  $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
};

/** Pickups treated as active (default / legacy docs) */
export const PICKUP_ACTIVE: Record<string, unknown> = {
  $or: [{ isActive: true }, { isActive: { $exists: false } }],
};

/**
 * Build find query for a pickup id that the user may use on an order (owned, active, not deleted).
 */
export function pickupByIdSelectableQuery(pickupId: string, user: IUser): Record<string, unknown> {
  const owner = getPickupOwnerFilterForUser(user);
  const parts: Record<string, unknown>[] = [
    { _id: pickupId },
    { ...PICKUP_NOT_DELETED },
    { ...PICKUP_ACTIVE },
  ];
  if (Object.keys(owner).length > 0) {
    parts.splice(1, 0, owner);
  }
  return { $and: parts };
}

/**
 * List/manage query: non-deleted pickups for this user. When includeInactive is false, only active rows.
 */
export function pickupListQuery(user: IUser, opts?: { includeInactive?: boolean }): Record<string, unknown> {
  const owner = getPickupOwnerFilterForUser(user);
  const parts: Record<string, unknown>[] = [{ ...PICKUP_NOT_DELETED }];
  if (!opts?.includeInactive) {
    parts.push({ ...PICKUP_ACTIVE });
  }
  if (Object.keys(owner).length > 0) {
    parts.unshift(owner);
  }
  return parts.length === 1 ? { ...parts[0]! } : { $and: parts };
}

/** Pickup by id that the user may still manage (not soft-deleted); includes inactive rows. */
export function pickupByIdManageQuery(pickupId: string | Types.ObjectId, user: IUser): Record<string, unknown> {
  const q = pickupListQuery(user, { includeInactive: true });
  const idCond = { _id: pickupId };
  if ("$and" in q && Array.isArray((q as { $and: Record<string, unknown>[] }).$and)) {
    return { $and: [idCond, ...(q as { $and: Record<string, unknown>[] }).$and] };
  }
  return { $and: [idCond, q] };
}

export async function clearDefaultPickupsForOwnerDoc(doc: {
  userId: Types.ObjectId;
  dropshipperId?: Types.ObjectId | null;
}): Promise<void> {
  const ownerClause =
    doc.dropshipperId != null
      ? { $or: [{ userId: doc.userId }, { dropshipperId: doc.dropshipperId }] }
      : { userId: doc.userId };
  await Pickup.updateMany(
    {
      $and: [ownerClause, { ...PICKUP_NOT_DELETED }],
    },
    { $set: { isDefault: false } }
  );
}
