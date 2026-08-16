import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Pickup } from "../models/Pickup.js";
import { getPickupOwnerFilterForUser } from "../utils/pickupOwnerFilter.js";
import { PICKUP_NOT_DELETED, PICKUP_ACTIVE } from "../utils/pickupQuery.js";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${(local ?? "").slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  const d = String(phone).replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return `******${d.slice(-4)}`;
}

function mapPickup(p: Record<string, unknown>) {
  return {
    _id: String(p._id),
    label: p.label,
    phone: maskPhone(String(p.phone ?? "")),
    pincode: p.pincode,
    userId: String(p.userId ?? ""),
    dropshipperId: p.dropshipperId != null ? String(p.dropshipperId) : "",
    velocityWarehouseId: typeof p.velocityWarehouseId === "string" ? p.velocityWarehouseId : "",
    createdAt: p.createdAt,
  };
}

/** Development only — see app.ts registration. */
export const debugMyPickups = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const uid = req.user._id;

  const pickupsReturnedByNormalApi = await Pickup.find({
    $and: [await getPickupOwnerFilterForUser(req.user), { ...PICKUP_NOT_DELETED }, { ...PICKUP_ACTIVE }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const rawPickupsMatchingByUserId = await Pickup.find({
    $and: [{ userId: uid }, { ...PICKUP_NOT_DELETED }, { ...PICKUP_ACTIVE }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const rawPickupsMatchingByDropshipperId = await Pickup.find({
    $and: [{ dropshipperId: uid }, { ...PICKUP_NOT_DELETED }, { ...PICKUP_ACTIVE }],
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    currentUser: {
      id: String(req.user._id),
      _id: String(req.user._id),
      role: req.user.role,
      email: maskEmail(req.user.email),
    },
    pickupsReturnedByNormalApi: pickupsReturnedByNormalApi.map((p) => mapPickup(p as Record<string, unknown>)),
    rawPickupsMatchingByUserId: rawPickupsMatchingByUserId.map((p) => mapPickup(p as Record<string, unknown>)),
    rawPickupsMatchingByDropshipperId: rawPickupsMatchingByDropshipperId.map((p) =>
      mapPickup(p as Record<string, unknown>)
    ),
    pickupIdFromLastLinkAttempt: null as null,
  });
});
