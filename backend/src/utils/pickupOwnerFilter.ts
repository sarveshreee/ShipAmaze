import type { IUser } from "../models/User.js";

/**
 * Same ownership scope the pickup-address list uses: link/unlink must not allow pickups
 * outside this filter (except admin, who may access any pickup by id).
 */
export function getPickupOwnerFilterForUser(user: IUser): Record<string, unknown> {
  const id = user._id;
  if (user.role === "admin") return {};
  if (user.role === "dropshipper") {
    return {
      $or: [{ userId: id }, { dropshipperId: id }],
    };
  }
  return { userId: id };
}
