import type { IUser } from "../models/User.js";
import { Vendor } from "../models/Vendor.js";
import { TtlCache } from "./ttlCache.js";

const vendorIdsCache = new TtlCache<string[]>(2 * 60_000);

/** Vendor._id values for Vendor docs directly owned by this vendor-role user account. */
async function vendorIdsOwnedByVendorUser(userId: string): Promise<string[]> {
  const cacheKey = `own:${userId}`;
  const cached = vendorIdsCache.get(cacheKey);
  if (cached) return cached;
  const rows = await Vendor.find({ userId }).select("_id").lean();
  const ids = rows.map((v) => String(v._id));
  vendorIdsCache.set(cacheKey, ids);
  return ids;
}

/** Vendor._id values a dropshipper account can operate on behalf of. */
async function vendorIdsAccessibleByDropshipper(userId: string): Promise<string[]> {
  const cacheKey = `access:${userId}`;
  const cached = vendorIdsCache.get(cacheKey);
  if (cached) return cached;
  const rows = await Vendor.find({
    $or: [{ ownerUserId: userId }, { assignedUserIds: userId }, { userId }],
  })
    .select("_id")
    .lean();
  const ids = rows.map((v) => String(v._id));
  vendorIdsCache.set(cacheKey, ids);
  return ids;
}

/** Call after vendor/warehouse assignment changes so stale vendor-id lookups aren't reused. */
export function invalidatePickupOwnerVendorCache(userId?: string): void {
  if (userId) {
    vendorIdsCache.delete(`own:${userId}`);
    vendorIdsCache.delete(`access:${userId}`);
  } else {
    vendorIdsCache.clear();
  }
}

/**
 * Same ownership scope the pickup-address list uses: link/unlink must not allow pickups
 * outside this filter (except admin, who may access any pickup by id).
 *
 * Pickup rows auto-mirrored from a vendor's Warehouse are stored under the platform admin's
 * userId (so every admin can see/use them), but they also carry the originating `vendorId`.
 * We include that here so the vendor who created the warehouse — and any dropshipper who is
 * allowed to operate on that vendor's behalf — can still see/select their own address when
 * creating orders or processing shipments, not just admins.
 */
export async function getPickupOwnerFilterForUser(user: IUser): Promise<Record<string, unknown>> {
  const id = user._id;
  if (user.role === "admin") return {};
  if (user.role === "dropshipper") {
    const vendorIds = await vendorIdsAccessibleByDropshipper(String(id));
    const or: Record<string, unknown>[] = [{ userId: id }, { dropshipperId: id }];
    if (vendorIds.length > 0) or.push({ vendorId: { $in: vendorIds } });
    return { $or: or };
  }
  const vendorIds = await vendorIdsOwnedByVendorUser(String(id));
  if (vendorIds.length > 0) {
    return { $or: [{ userId: id }, { vendorId: { $in: vendorIds } }] };
  }
  return { userId: id };
}
