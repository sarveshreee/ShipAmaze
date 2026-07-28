/**
 * Auto-sync ShipAmaze Pickup → Lorrigo pickup-address.
 *
 * Rules:
 * - Non-fatal: local pickup is never rolled back on provider failure
 * - Idempotent: if lorrigoPickupId already set, do not create another pickup
 * - When LORRIGO_ENABLED=false → skip (no provider call)
 */

import type { Types } from "mongoose";
import { Pickup } from "../../models/Pickup.js";
import { User } from "../../models/User.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { formatErrorMessage } from "../../utils/errorMessage.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "./lorrigo.config.js";
import { lorrigoPost } from "./lorrigo.client.js";

export type LorrigoPickupSyncResult =
  | { synced: true; pickupId: string; alreadySynced?: boolean; durationMs?: number }
  | { synced: false; skipped: true; reason: string }
  | { synced: false; error: string; durationMs?: number };

function extractLorrigoPickupId(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  const hub = o.hub as Record<string, unknown> | undefined;
  const data = o.data as Record<string, unknown> | undefined;
  const candidates = [
    o.id,
    o._id,
    o.pickupAddressId,
    o.pickup_address_id,
    hub?.id,
    hub?._id,
    hub?.code,
    data?.id,
    data?._id,
    (data?.hub as Record<string, unknown> | undefined)?.id,
    (o.pickupAddress as Record<string, unknown> | undefined)?.id,
    (o.result as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return "";
}

/**
 * Lorrigo validates:
 * - address must contain `/` or `-`
 * - rtoAddress (≥5 chars) and rtoPincode (6 digits) are required
 * When ShipAmaze has no separate RTO address, reuse the pickup address.
 */
export function ensureLorrigoAddressShape(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "Address -";
  if (/[/-]/.test(trimmed)) return trimmed;
  return `${trimmed} -`;
}

export function pickupToLorrigoPickupPayload(
  pickup: {
    label: string;
    contactName: string;
    phone: string;
    email?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  },
  fallbackEmail: string
) {
  const email = (pickup.email ?? "").trim() || fallbackEmail.trim();
  const pincode = String(pickup.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const line1 = pickup.addressLine1.trim();
  const line2 = (pickup.addressLine2 ?? "").trim();
  const city = pickup.city.trim();
  // RTO address must be ≥5 chars; pad short lines with city before shape check.
  const baseAddress = line1.length >= 5 ? line1 : `${line1} ${city}`.trim();
  const address = ensureLorrigoAddressShape(baseAddress);
  return {
    facilityName: pickup.label.trim() || "Pickup",
    contactPersonName: pickup.contactName.trim() || pickup.label.trim() || "Contact",
    email,
    pincode,
    address,
    address2: line2,
    phone: String(pickup.phone ?? "").replace(/\D/g, "").slice(-10),
    city,
    state: pickup.state.trim(),
    country: (pickup.country ?? "India").trim() || "India",
    // Required by Lorrigo create pickup-address (default RTO = pickup)
    rtoAddress: address,
    rtoPincode: pincode,
  };
}

/**
 * Sync a local Pickup to Lorrigo.
 * @param force when true, allows retry of FAILED sync; never recreates if lorrigoPickupId exists.
 */
export async function syncPickupToLorrigo(
  pickupId: string | Types.ObjectId,
  opts?: { force?: boolean }
): Promise<LorrigoPickupSyncResult> {
  const id = String(pickupId);

  if (!isLorrigoEnabledFlag()) {
    return { synced: false, skipped: true, reason: "LORRIGO_ENABLED is false" };
  }
  if (!isLorrigoConfigured()) {
    return { synced: false, skipped: true, reason: "Lorrigo credentials not configured" };
  }

  const pickup = await Pickup.findById(id);
  if (!pickup || pickup.deletedAt) {
    return { synced: false, error: "Pickup not found" };
  }

  const existingId = (pickup.lorrigoPickupId ?? "").trim();
  if (existingId) {
    // Idempotency: never create a duplicate on Lorrigo
    if (pickup.lorrigoSyncStatus !== "SUCCESS") {
      pickup.lorrigoSyncStatus = "SUCCESS";
      pickup.lorrigoSyncError = undefined;
      pickup.lorrigoLastSyncAt = new Date();
      await pickup.save();
    }
    console.info(
      `[lorrigo] pickup sync skipped (already synced) pickupId=${id} lorrigoPickupId=${existingId}`
    );
    return { synced: true, pickupId: existingId, alreadySynced: true };
  }

  if (pickup.lorrigoSyncStatus === "SUCCESS" && !opts?.force) {
    return { synced: false, skipped: true, reason: "Already marked SUCCESS without provider id" };
  }

  const owner = await User.findById(pickup.userId).select("email").lean();
  const fallbackEmail = typeof owner?.email === "string" ? owner.email : "";
  const body = pickupToLorrigoPickupPayload(pickup, fallbackEmail);

  console.info(`[lorrigo] pickup sync started pickupId=${id}`);
  const started = Date.now();

  try {
    const raw = await lorrigoPost<unknown>("/v2/pickup-address", body);
    const providerId = extractLorrigoPickupId(raw);
    if (!providerId) {
      throw new AppError(502, "Lorrigo pickup create succeeded but no pickup id was returned");
    }

    pickup.lorrigoPickupId = providerId;
    pickup.lorrigoSyncStatus = "SUCCESS";
    pickup.lorrigoLastSyncAt = new Date();
    pickup.lorrigoSyncError = undefined;
    await pickup.save();

    const durationMs = Date.now() - started;
    console.info(
      `[lorrigo] pickup sync succeeded pickupId=${id} lorrigoPickupId=${providerId} durationMs=${durationMs}`
    );
    return { synced: true, pickupId: providerId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = formatErrorMessage(err, "Lorrigo pickup sync failed");
    pickup.lorrigoSyncStatus = "FAILED";
    pickup.lorrigoLastSyncAt = new Date();
    pickup.lorrigoSyncError = message.slice(0, 500);
    await pickup.save();

    console.error(
      `[lorrigo] pickup sync failed pickupId=${id} durationMs=${durationMs} error=${message}`
    );
    return { synced: false, error: message, durationMs };
  }
}
