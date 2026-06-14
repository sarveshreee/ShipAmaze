/**
 * Velocity warehouse resolution — live Pickup/Warehouse link preferred over stale order copies.
 */

import mongoose from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { pickupByIdManageQuery, PICKUP_NOT_DELETED } from "../../utils/pickupQuery.js";
import type { IOrder } from "../../models/Order.js";
import { Pickup } from "../../models/Pickup.js";
import { Warehouse } from "../../models/Warehouse.js";
import { Vendor } from "../../models/Vendor.js";

export type PickupSnapshot = {
  id: string;
  label: string;
  warehouseName?: string;
  contactName?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  velocityWarehouseId?: string;
};

export type MergedForwardContext = Record<string, unknown> & {
  warehouse_id?: string;
  pickupAddressId?: string;
  pickupWarehouseId?: string;
  pickupAddress?: PickupSnapshot;
};

export type LiveWarehouseResolution = {
  warehouse_id: string;
  pickupAddressId: string;
  pickupWarehouseId: string;
  pickupAddress?: PickupSnapshot;
};

type PickupRefSource = { pickupAddressId?: unknown; pickupWarehouseId?: unknown } | null;

/**
 * Ordered unique Mongo ids to resolve — request body refs first, then order refs.
 */
export function collectPickupMongoCandidateIds(
  body: Record<string, unknown>,
  localOrder: PickupRefSource
): string[] {
  const raw = [
    body.warehouseId,
    body.pickupWarehouseId,
    localOrder?.pickupAddressId,
    localOrder?.pickupWarehouseId,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (v == null || String(v).trim() === "") continue;
    const s = String(v).trim();
    if (!mongoose.isValidObjectId(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function toPickupSnapshot(pickup: Record<string, unknown>): PickupSnapshot {
  const label = String(pickup.label ?? "Pickup Address");
  const address = [pickup.addressLine1, pickup.addressLine2, pickup.landmark]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    id: String(pickup._id ?? ""),
    label,
    warehouseName: label,
    contactName: String(pickup.contactName ?? ""),
    phone: String(pickup.phone ?? ""),
    alternatePhone: String(pickup.alternatePhone ?? ""),
    email: String(pickup.email ?? ""),
    address,
    city: String(pickup.city ?? ""),
    state: String(pickup.state ?? ""),
    pincode: String(pickup.pincode ?? ""),
    country: String(pickup.country ?? "India"),
    gstin: String(pickup.gstin ?? ""),
    velocityWarehouseId: String(pickup.velocityWarehouseId ?? ""),
  };
}

function pickupResolutionFromPickup(pu: Record<string, unknown>): LiveWarehouseResolution {
  const code = String(pu.velocityWarehouseId ?? "").trim();
  if (!code) {
    throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
  }
  const pid = String(pu._id);
  return {
    warehouse_id: code,
    pickupAddressId: pid,
    pickupWarehouseId: pid,
    pickupAddress: toPickupSnapshot(pu),
  };
}

async function assertWarehouseAccessForVelocity(
  user: NonNullable<AuthRequest["user"]>,
  wh: { vendorId: unknown }
) {
  if (user.role === "admin") return;
  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Vendor profile not found.");
    if (String(wh.vendorId) !== String(vendor._id)) {
      throw new AppError(403, "You can only link your own warehouses.");
    }
    return;
  }
  throw new AppError(403, "Forbidden");
}

/** Ensures a Velocity warehouse code is linked to this user (vendor Warehouse or dropshipper Pickup). */
export async function assertVelocityWarehouseCodeOwned(
  user: NonNullable<AuthRequest["user"]>,
  code: string
) {
  const c = code.trim();
  if (user.role === "admin") return;

  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Forbidden");
    const w = await Warehouse.findOne({ vendorId: vendor._id, velocityWarehouseId: c }).lean();
    if (!w) throw new AppError(403, "Forbidden");
    return;
  }

  if (user.role === "dropshipper") {
    const p = await Pickup.findOne({
      $and: [
        { velocityWarehouseId: c },
        { $or: [{ userId: user._id }, { dropshipperId: user._id }] },
        { ...PICKUP_NOT_DELETED },
      ],
    }).lean();
    if (!p) throw new AppError(403, "Forbidden");
    return;
  }

  throw new AppError(403, "Forbidden");
}

/**
 * Resolve live Velocity warehouse code from a local Mongo Pickup or Warehouse id.
 * Returns null when the entity does not exist (caller may try the next candidate id).
 */
export async function resolveLiveVelocityWarehouseFromMongoId(
  req: AuthRequest,
  mongoId: string
): Promise<LiveWarehouseResolution | null> {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (!mongoose.isValidObjectId(mongoId)) {
    throw new AppError(400, "Invalid warehouseId");
  }
  const oid = new mongoose.Types.ObjectId(mongoId);

  if (req.user.role === "admin") {
    const pu =
      (await Pickup.findOne({ $and: [{ _id: oid }, { ...PICKUP_NOT_DELETED }] }).lean()) ??
      (await Pickup.findOne(pickupByIdManageQuery(oid, req.user)).lean());
    if (pu) return pickupResolutionFromPickup(pu as Record<string, unknown>);
    return null;
  }

  const puOwned = await Pickup.findOne(pickupByIdManageQuery(oid, req.user)).lean();

  if (req.user.role === "dropshipper") {
    if (puOwned) return pickupResolutionFromPickup(puOwned as Record<string, unknown>);
    const wh = await Warehouse.findById(oid).lean();
    if (wh) {
      throw new AppError(
        403,
        "Select your linked pickup address for shipments. A vendor warehouse ID cannot be used as a dropshipper."
      );
    }
    return null;
  }

  const wh = await Warehouse.findById(oid).lean();
  if (wh) {
    await assertWarehouseAccessForVelocity(req.user, wh);
    const code = String(wh.velocityWarehouseId ?? "").trim();
    if (!code) {
      throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
    }
    return {
      warehouse_id: code,
      pickupAddressId: String(wh._id),
      pickupWarehouseId: String(wh._id),
    };
  }
  if (puOwned) return pickupResolutionFromPickup(puOwned as Record<string, unknown>);
  return null;
}

/**
 * Resolution order:
 * 1. Live Pickup/Warehouse via mongo refs (body warehouseId/pickupWarehouseId, then order pickup refs)
 * 2. Explicit request body warehouse_id (ownership asserted)
 * 3. Stale order.velocityWarehouseId (fallback only)
 */
export async function mergeVelocityWarehouse(
  req: AuthRequest,
  body: Record<string, unknown>,
  localOrder: IOrder | null
): Promise<MergedForwardContext> {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const out: MergedForwardContext = { ...body };

  const explicit =
    out.warehouse_id != null && String(out.warehouse_id).trim() !== ""
      ? String(out.warehouse_id).trim()
      : "";
  const fromOrder = localOrder?.velocityWarehouseId?.trim() ?? "";

  const candidateIds = collectPickupMongoCandidateIds(body, localOrder);
  for (const mongoId of candidateIds) {
    const live = await resolveLiveVelocityWarehouseFromMongoId(req, mongoId);
    if (live) {
      out.warehouse_id = live.warehouse_id;
      out.pickupAddressId = live.pickupAddressId;
      out.pickupWarehouseId = live.pickupWarehouseId;
      if (live.pickupAddress) out.pickupAddress = live.pickupAddress;
      return out;
    }
  }

  if (explicit) {
    await assertVelocityWarehouseCodeOwned(req.user, explicit);
    out.warehouse_id = explicit;
    return out;
  }

  if (fromOrder) {
    out.warehouse_id = fromOrder;
    return out;
  }

  return out;
}

/** Payload fallback when merge left warehouse_id empty — avoid stale order copy if a pickup ref exists. */
export function resolvePayloadWarehouseId(
  merged: Record<string, unknown>,
  localOrder: IOrder | null
): string {
  const fromMerged =
    merged.warehouse_id != null && String(merged.warehouse_id).trim() !== ""
      ? String(merged.warehouse_id).trim()
      : "";
  if (fromMerged) return fromMerged;
  const hasPickupRef =
    localOrder?.pickupAddressId != null ||
    (localOrder?.pickupWarehouseId != null && String(localOrder.pickupWarehouseId).trim() !== "");
  if (hasPickupRef) return "";
  return localOrder?.velocityWarehouseId?.trim() ?? "";
}
