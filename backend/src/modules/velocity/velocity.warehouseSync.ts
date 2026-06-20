/**
 * Velocity warehouse sync — auto-create warehouses in Velocity from local Pickup/Warehouse docs.
 *
 * Rules:
 * - Idempotent: skip if velocityWarehouseId already set
 * - Graceful degradation: no credentials → skip (returns { skipped: true })
 * - Non-fatal: callers must decide whether to surface the error or swallow it
 */

import type { Types } from "mongoose";
import { Pickup } from "../../models/Pickup.js";
import { Warehouse } from "../../models/Warehouse.js";
import { User } from "../../models/User.js";
import { velocityConfig } from "./velocity.config.js";
import { createWarehouseInVelocity, updateWarehouseInVelocity } from "./velocity.service.js";
import {
  normalizePhoneNumber10Digit,
  normalizePincode,
  sanitizeCourierPersonName,
  sanitizeCourierWarehouseName,
  type VelocityPreparedWarehouseInput,
} from "./velocity.payload.js";

export type VelocityWarehouseSyncResult =
  | { linked: true; warehouse_id: string }
  | { linked: false; skipped: true; reason: string }
  | { linked: false; error: string };

function isVelocityConfigured(): boolean {
  return Boolean(velocityConfig.username && velocityConfig.password);
}

function buildStreetAddress(line1: string, line2?: string, landmark?: string): string {
  return [line1, line2, landmark]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function safePhone(raw: string): string {
  try {
    return normalizePhoneNumber10Digit(raw);
  } catch {
    return raw.replace(/\D/g, "").slice(-10);
  }
}

function safePincode(raw: string): string {
  try {
    return normalizePincode(raw);
  } catch {
    return raw.replace(/\D/g, "").slice(0, 6);
  }
}

/** Map a Pickup doc to the Velocity warehouse creation input. */
export function pickupToVelocityWarehouseInput(
  pickup: {
    label: string;
    contactName: string;
    phone: string;
    email?: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
    gstin?: string;
  },
  fallbackEmail: string
): VelocityPreparedWarehouseInput {
  const email = (pickup.email ?? "").trim() || fallbackEmail.trim();
  const contactRaw = pickup.contactName.trim() || pickup.label.trim();
  return {
    name: sanitizeCourierWarehouseName(pickup.label.trim()),
    phone_number: safePhone(pickup.phone),
    email,
    contact_person: sanitizeCourierPersonName(contactRaw),
    street_address: buildStreetAddress(pickup.addressLine1, pickup.addressLine2, pickup.landmark),
    zip: safePincode(pickup.pincode),
    city: pickup.city.trim(),
    state: pickup.state.trim(),
    country: (pickup.country ?? "India").trim() || "India",
    gst_no: pickup.gstin?.trim() || undefined,
  };
}

/** Map a vendor Warehouse doc to the Velocity warehouse creation input. */
export function warehouseDocToVelocityInput(
  wh: {
    name: string;
    contactName?: string;
    phone?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  },
  fallbackEmail: string
): VelocityPreparedWarehouseInput {
  return {
    name: sanitizeCourierWarehouseName(wh.name.trim()),
    phone_number: safePhone(wh.phone ?? ""),
    email: fallbackEmail.trim(),
    contact_person: sanitizeCourierPersonName((wh.contactName ?? wh.name).trim()),
    street_address: buildStreetAddress(wh.addressLine1, wh.addressLine2),
    zip: safePincode(wh.pincode),
    city: wh.city.trim(),
    state: wh.state.trim(),
    country: "India",
  };
}

/**
 * Auto-create a warehouse in Velocity for a local Pickup doc (by Mongo id).
 * Idempotent — does nothing if already linked.
 */
export async function syncPickupToVelocity(
  pickupId: Types.ObjectId | string
): Promise<VelocityWarehouseSyncResult> {
  if (!isVelocityConfigured()) {
    return { linked: false, skipped: true, reason: "Velocity credentials not configured" };
  }

  const pickup = await Pickup.findById(pickupId).lean();
  if (!pickup) {
    return { linked: false, error: "Pickup address not found" };
  }

  if (pickup.velocityWarehouseId?.trim()) {
    const whId = pickup.velocityWarehouseId.trim();
    let fallbackEmail = "";
    try {
      const owner = await User.findById(pickup.userId).select("email").lean();
      fallbackEmail = owner?.email ?? "";
    } catch {
      /* non-fatal */
    }
    const email = (pickup.email ?? "").trim() || fallbackEmail;
    if (email) {
      try {
        const input = pickupToVelocityWarehouseInput(
          pickup as Parameters<typeof pickupToVelocityWarehouseInput>[0],
          fallbackEmail
        );
        await updateWarehouseInVelocity(whId, input);
      } catch {
        /* Velocity may not support update; sanitized names apply on next warehouse create */
      }
    }
    return { linked: true, warehouse_id: whId };
  }

  // Load owner email as fallback when pickup email is empty
  let fallbackEmail = "";
  try {
    const owner = await User.findById(pickup.userId).select("email").lean();
    fallbackEmail = owner?.email ?? "";
  } catch {
    // non-fatal
  }

  const email = (pickup.email ?? "").trim() || fallbackEmail;
  if (!email) {
    return { linked: false, error: "Email is required to register warehouse in Velocity. Add email to pickup address." };
  }

  let input: VelocityPreparedWarehouseInput;
  try {
    input = pickupToVelocityWarehouseInput(pickup as Parameters<typeof pickupToVelocityWarehouseInput>[0], fallbackEmail);
  } catch (e) {
    return { linked: false, error: `Invalid pickup data: ${e instanceof Error ? e.message : String(e)}` };
  }

  try {
    const resp = await createWarehouseInVelocity(input);
    const code = String(resp.warehouse_id);
    await Pickup.findByIdAndUpdate(pickupId, { velocityWarehouseId: code });
    return { linked: true, warehouse_id: code };
  } catch (e) {
    return { linked: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Auto-create a warehouse in Velocity for a vendor Warehouse doc (by Mongo id).
 * Idempotent — does nothing if already linked.
 */
export async function syncVendorWarehouseToVelocity(
  warehouseId: Types.ObjectId | string,
  ownerUserId?: Types.ObjectId | string
): Promise<VelocityWarehouseSyncResult> {
  if (!isVelocityConfigured()) {
    return { linked: false, skipped: true, reason: "Velocity credentials not configured" };
  }

  const wh = await Warehouse.findById(warehouseId).lean();
  if (!wh) {
    return { linked: false, error: "Warehouse not found" };
  }

  if (wh.velocityWarehouseId?.trim()) {
    return { linked: true, warehouse_id: wh.velocityWarehouseId.trim() };
  }

  // Load owner email
  let fallbackEmail = "";
  const lookupUserId = ownerUserId ?? wh.ownerUserId;
  if (lookupUserId) {
    try {
      const owner = await User.findById(lookupUserId).select("email").lean();
      fallbackEmail = owner?.email ?? "";
    } catch {
      // non-fatal
    }
  }

  if (!fallbackEmail) {
    return { linked: false, error: "No owner email found — cannot register warehouse in Velocity." };
  }

  let input: VelocityPreparedWarehouseInput;
  try {
    input = warehouseDocToVelocityInput(wh as Parameters<typeof warehouseDocToVelocityInput>[0], fallbackEmail);
  } catch (e) {
    return { linked: false, error: `Invalid warehouse data: ${e instanceof Error ? e.message : String(e)}` };
  }

  try {
    const resp = await createWarehouseInVelocity(input);
    const code = String(resp.warehouse_id);
    await Warehouse.findByIdAndUpdate(warehouseId, { velocityWarehouseId: code });
    return { linked: true, warehouse_id: code };
  } catch (e) {
    return { linked: false, error: e instanceof Error ? e.message : String(e) };
  }
}
