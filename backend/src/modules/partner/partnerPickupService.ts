import mongoose from "mongoose";
import { Pickup, type IPickup } from "../../models/Pickup.js";
import { User } from "../../models/User.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { IPartner } from "../../models/Partner.js";
import { PICKUP_ACTIVE, PICKUP_NOT_DELETED } from "../../utils/pickupQuery.js";
import { getPickupOwnerFilterForUser } from "../../utils/pickupOwnerFilter.js";

export async function assertPartnerPickupAccess(
  partner: IPartner,
  pickupAddressId: string
): Promise<IPickup> {
  if (!pickupAddressId || !mongoose.isValidObjectId(pickupAddressId)) {
    throw new AppError(400, "pickupAddressId must be a valid ShipAmaze pickup address id");
  }

  const linkedUser = await User.findById(partner.linkedUserId);
  if (!linkedUser) {
    throw new AppError(400, "Partner linked user not found");
  }

  const ownerFilter = await getPickupOwnerFilterForUser(linkedUser);
  const pickup = await Pickup.findOne({
    $and: [
      { _id: pickupAddressId },
      ownerFilter,
      { ...PICKUP_NOT_DELETED },
      { ...PICKUP_ACTIVE },
    ],
  });

  if (!pickup) {
    throw new AppError(403, "Pickup address not found or not accessible for this partner");
  }

  if (partner.allowedPickupIds && partner.allowedPickupIds.length > 0) {
    const allowed = partner.allowedPickupIds.some(
      (id) => String(id) === String(pickup._id)
    );
    if (!allowed) {
      throw new AppError(403, "Pickup address is not allowed for this partner");
    }
  }

  return pickup;
}

/**
 * Lorrigo bookings require the pickup to be synced to Lorrigo before order creation.
 */
export async function assertPartnerLorrigoPickupSynced(
  provider: string,
  pickup: IPickup
): Promise<void> {
  if (String(provider).toLowerCase() !== "lorrigo") return;

  const lorrigoPickupId = String(
    (pickup as { lorrigoPickupId?: string }).lorrigoPickupId ?? ""
  ).trim();
  const syncStatus = String((pickup as { lorrigoSyncStatus?: string }).lorrigoSyncStatus ?? "");

  if (!lorrigoPickupId) {
    throw Object.assign(
      new AppError(
        422,
        "Pickup is not synced to Lorrigo. Sync the pickup address in ShipAmaze before booking Lorrigo shipments."
      ),
      { code: "PICKUP_NOT_SYNCED" }
    );
  }
  if (syncStatus === "FAILED") {
    throw Object.assign(
      new AppError(
        422,
        "Pickup Lorrigo sync failed. Retry sync in ShipAmaze before booking Lorrigo shipments."
      ),
      { code: "PICKUP_SYNC_FAILED" }
    );
  }
}

export function partnerAllowedProviders(partner: IPartner): ("velocity" | "lorrigo" | "ekart")[] {
  if (partner.allowedProviders && partner.allowedProviders.length > 0) {
    return [...partner.allowedProviders];
  }
  return ["velocity", "lorrigo", "ekart"];
}

export function assertPartnerProviderAllowed(
  partner: IPartner,
  provider: string
): "velocity" | "lorrigo" | "ekart" {
  const normalized = String(provider).trim().toLowerCase();
  if (normalized !== "velocity" && normalized !== "lorrigo" && normalized !== "ekart") {
    throw new AppError(400, "provider must be velocity, lorrigo, or ekart");
  }
  const allowed = partnerAllowedProviders(partner);
  if (!allowed.includes(normalized)) {
    throw new AppError(403, `Provider ${normalized} is not allowed for this partner`);
  }
  return normalized;
}
