/**
 * Ekart pickup "sync" = link Elite-registered location_code to ShipAmaze Pickup.
 *
 * Durin has no public create-warehouse API. Locations must be added in Elite
 * (Settings → Pickup locations) and approved by Ekart, then linked here.
 * Booking then sends source.location_code so shipments appear in Elite.
 */

import mongoose from "mongoose";
import { Pickup } from "../../models/Pickup.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { isEkartConfigured, isEkartEnabledFlag, ekartConfig } from "./ekart.config.js";

export type EkartPickupSyncResult =
  | { synced: true; locationCode: string; alreadySynced?: boolean }
  | { synced: false; skipped: true; reason: string }
  | { synced: false; error: string };

/** Elite location codes are alphanumeric + underscore/hyphen, typically under 120 chars. */
export function normalizeEkartLocationCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

export function validateEkartLocationCode(raw: unknown): string {
  const code = normalizeEkartLocationCode(raw);
  if (!code) return "Ekart location code is required";
  if (code.length < 2) return "Ekart location code is too short";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code)) {
    return "Use the location code from Elite (letters, numbers, _ or - only)";
  }
  return "";
}

export function resolveEkartPickupLocationCode(pickup: {
  ekartLocationCode?: string | null;
}): string {
  return (
    normalizeEkartLocationCode(pickup.ekartLocationCode) || ekartConfig.defaultLocationCode
  );
}

/**
 * Link an Elite location_code onto a ShipAmaze pickup.
 * Does not call Durin create-location (API does not exist).
 */
export async function linkPickupToEkart(
  pickupId: string,
  locationCodeRaw: string,
  opts?: { force?: boolean }
): Promise<EkartPickupSyncResult> {
  if (!isEkartEnabledFlag()) {
    return { synced: false, skipped: true, reason: "Ekart is disabled (EKART_ENABLED is not true)" };
  }
  if (!isEkartConfigured()) {
    return {
      synced: false,
      skipped: true,
      reason: "Ekart credentials missing (EKART_AUTHORIZATION / EKART_MERCHANT_CODE)",
    };
  }

  const err = validateEkartLocationCode(locationCodeRaw);
  if (err) return { synced: false, error: err };

  const code = normalizeEkartLocationCode(locationCodeRaw);
  if (!mongoose.isValidObjectId(pickupId)) {
    return { synced: false, error: "Invalid pickup id" };
  }

  const pickup = await Pickup.findById(pickupId);
  if (!pickup || pickup.deletedAt) {
    return { synced: false, error: "Pickup address not found" };
  }

  const existing = normalizeEkartLocationCode(pickup.ekartLocationCode);
  if (existing && existing === code && !opts?.force) {
    pickup.ekartSyncStatus = "SUCCESS";
    pickup.ekartLastSyncAt = new Date();
    pickup.ekartSyncError = undefined;
    await pickup.save();
    return { synced: true, locationCode: code, alreadySynced: true };
  }

  pickup.ekartLocationCode = code;
  pickup.ekartSyncStatus = "SUCCESS";
  pickup.ekartLastSyncAt = new Date();
  pickup.ekartSyncError = undefined;
  await pickup.save();

  return { synced: true, locationCode: code };
}

export async function unlinkPickupFromEkart(pickupId: string): Promise<EkartPickupSyncResult> {
  if (!mongoose.isValidObjectId(pickupId)) {
    return { synced: false, error: "Invalid pickup id" };
  }
  const pickup = await Pickup.findById(pickupId);
  if (!pickup || pickup.deletedAt) {
    return { synced: false, error: "Pickup address not found" };
  }

  pickup.ekartLocationCode = undefined;
  pickup.ekartSyncStatus = undefined;
  pickup.ekartLastSyncAt = new Date();
  pickup.ekartSyncError = undefined;
  await pickup.save();

  return { synced: true, locationCode: "" };
}

/** Assert pickup is owned by caller (or admin). Throws AppError. */
export async function assertEkartPickupAccess(
  pickupId: string,
  user: { _id: unknown; role: string }
): Promise<void> {
  if (!mongoose.isValidObjectId(pickupId)) throw new AppError(400, "Invalid pickup id");
  const pickup = await Pickup.findById(pickupId).select("userId dropshipperId deletedAt").lean();
  if (!pickup || (pickup as { deletedAt?: Date }).deletedAt) {
    throw new AppError(404, "Pickup address not found");
  }
  if (user.role === "admin") return;
  const uid = String(user._id);
  const ownerOk =
    String((pickup as { userId?: unknown }).userId) === uid ||
    String((pickup as { dropshipperId?: unknown }).dropshipperId ?? "") === uid;
  if (!ownerOk) throw new AppError(403, "Forbidden");
}
