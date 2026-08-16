import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  getBulkCourierPriority,
  saveBulkCourierPriority,
} from "../services/bulkCourierPriorityService.js";
import { Pickup } from "../models/Pickup.js";
import { pickupByIdSelectableQuery, PICKUP_NOT_DELETED } from "../utils/pickupQuery.js";
import { normalizePincode } from "../modules/velocity/velocity.payload.js";
import * as velocityService from "../modules/velocity/velocity.service.js";
import { isVelocityConfigured } from "../config/env.js";

function mapPriorityList(items: Awaited<ReturnType<typeof getBulkCourierPriority>>) {
  return {
    priorities: items.map((p) => ({
      courierName: p.courierName,
      carrierId: p.carrierId ?? "",
      provider: p.provider ?? "",
      rank: p.rank,
    })),
  };
}

/** GET /admin/bulk-courier-priority — saved platform priority for bulk order processing. */
export const getBulkCourierPrioritySettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const items = await getBulkCourierPriority();
  res.json(mapPriorityList(items));
});

/** PUT /admin/bulk-courier-priority — persist platform priority list. */
export const saveBulkCourierPrioritySettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const body = req.body as { priorities?: unknown };
  try {
    const saved = await saveBulkCourierPriority(body.priorities);
    res.json(mapPriorityList(saved));
  } catch (err: unknown) {
    throw new AppError(400, err instanceof Error ? err.message : "Invalid priorities payload");
  }
});

/**
 * GET /admin/bulk-courier-priority/velocity-carriers
 * Returns Velocity serviceable carriers for pickup + destination pincode.
 */
export const listVelocityCarriersForLane = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  if (!isVelocityConfigured()) {
    throw new AppError(503, "Velocity credentials are not configured");
  }

  const pickupAddressId = String(req.query.pickupAddressId ?? "").trim();
  let fromPin = normalizePincode(String(req.query.fromPin ?? ""));
  const toPin = normalizePincode(String(req.query.toPin ?? ""));
  const payment = String(req.query.payment_mode ?? "prepaid").toLowerCase().includes("cod")
    ? ("cod" as const)
    : ("prepaid" as const);

  if (!fromPin && pickupAddressId) {
    const pickup = await Pickup.findOne(await pickupByIdSelectableQuery(pickupAddressId, req.user))
      .select("pincode")
      .lean();
    if (pickup?.pincode) fromPin = normalizePincode(String(pickup.pincode));
  }

  if (!fromPin) {
    const defaultPickup = await Pickup.findOne({
      ...PICKUP_NOT_DELETED,
      pincode: { $exists: true, $ne: "" },
    })
      .sort({ isDefault: -1, updatedAt: -1 })
      .select("pincode")
      .lean();
    if (defaultPickup?.pincode) fromPin = normalizePincode(String(defaultPickup.pincode));
  }

  if (fromPin.length !== 6 || toPin.length !== 6) {
    throw new AppError(400, "Valid from and to pincodes (6 digits) are required");
  }

  const svc = await velocityService.checkServiceability({
    from: fromPin,
    to: toPin,
    payment_mode: payment,
    shipment_type: "forward",
  });

  const rates = await velocityService
    .getRates({
      from: fromPin,
      to: toPin,
      weight: 0.5,
      length: 10,
      width: 10,
      height: 10,
      payment_mode: payment,
      shipment_type: "forward",
      ...(payment === "cod" ? { cod_value: 500 } : {}),
    })
    .catch(() => ({ data: [] as { carrier_id: string | number; carrier_name: string }[] }));

  const seen = new Set<string>();
  const items: { carrier_id: string; carrier_name: string }[] = [];

  const pushCarrier = (carrierId: unknown, carrierName: unknown) => {
    const id = carrierId != null ? String(carrierId).trim() : "";
    const name = String(carrierName ?? id).trim();
    if (!id || !name) return;
    const key = `${id}::${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ carrier_id: id, carrier_name: name });
  };

  for (const row of rates.data ?? []) {
    pushCarrier(row.carrier_id, row.carrier_name);
  }
  for (const row of svc.data ?? []) {
    pushCarrier(row.carrier_id, row.carrier_name);
  }

  res.json({ items, fromPin, toPin });
});
