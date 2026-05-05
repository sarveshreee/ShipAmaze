/**
 * Velocity Shipping – Express controllers.
 * Each handler validates, calls the service, and handles Order model side-effects.
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { getPickupOwnerFilterForUser } from "../../utils/pickupOwnerFilter.js";
import { Order, type IOrder } from "../../models/Order.js";
import { Warehouse } from "../../models/Warehouse.js";
import { Vendor } from "../../models/Vendor.js";
import { Pickup } from "../../models/Pickup.js";
import * as velocityService from "./velocity.service.js";
import { mapVelocityStatus } from "./velocity.mapper.js";
import type {
  VelocityCustomer,
  VelocityForwardOrderRequest,
  VelocityReverseOrderRequest,
} from "./velocity.types.js";

// ─── Serviceability ──────────────────────────────────────

export const serviceability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { from, to, payment_mode, shipment_type } = req.body as {
    from?: string;
    to?: string;
    payment_mode?: "cod" | "prepaid";
    shipment_type?: "forward" | "return";
  };

  if (!from || !to) throw new AppError(400, "from and to pincodes are required");
  if (!payment_mode) throw new AppError(400, "payment_mode (cod|prepaid) is required");

  const result = await velocityService.checkServiceability({
    from,
    to,
    payment_mode,
    shipment_type: shipment_type ?? "forward",
  });

  res.json({ success: true, data: result.data ?? [] });
});

// ─── Rates ───────────────────────────────────────────────

export const rates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    from,
    to,
    weight,
    length,
    width,
    height,
    payment_mode,
    cod_value,
    shipment_type,
    qc_applicable,
  } = req.body as {
    from?: string;
    to?: string;
    weight?: number;
    length?: number;
    width?: number;
    height?: number;
    payment_mode?: "cod" | "prepaid";
    cod_value?: number;
    shipment_type?: "forward" | "return";
    qc_applicable?: boolean;
  };

  if (!from || !to) throw new AppError(400, "from and to pincodes are required");
  if (weight === undefined || weight === null || Number(weight) <= 0)
    throw new AppError(400, "weight (dead_weight, kg) is required");
  if (!payment_mode) throw new AppError(400, "payment_mode (cod|prepaid) is required");
  if (payment_mode === "cod") {
    if (cod_value == null || Number(cod_value) <= 0) {
      throw new AppError(400, "cod_value is required for COD (sent to Velocity as shipment_value)");
    }
  }

  const st = shipment_type ?? "forward";
  if (st === "return" && qc_applicable !== undefined && typeof qc_applicable !== "boolean") {
    throw new AppError(400, "qc_applicable must be a boolean when provided");
  }

  const result = await velocityService.getRates({
    from,
    to,
    weight: Number(weight),
    length: Number(length ?? 10),
    width: Number(width ?? 10),
    height: Number(height ?? 10),
    payment_mode,
    cod_value: cod_value != null ? Number(cod_value) : undefined,
    shipment_type: st,
    qc_applicable,
  });

  res.json({ success: true, data: result.data ?? [] });
});

// ─── Warehouse ───────────────────────────────────────────

const VELOCITY_WH_ID_PATTERN = /^WH[A-Z0-9]+$/i;

type VelocityWarehouseRegisterBody = {
  linkOnly?: boolean | string;
  warehouseId?: string;
  velocityWarehouseId?: string | number;
  unlink?: boolean | string;
};

/**
 * Development-only: compare raw pickup row vs list filter ownership (see getPickupOwnerFilterForUser).
 */
async function devLogVelocityLinkPickup(
  req: AuthRequest,
  oid: mongoose.Types.ObjectId,
  _pickupOwned: unknown
) {
  if (process.env.NODE_ENV !== "development") return;
  const raw = await Pickup.findById(oid).select("userId dropshipperId").lean();
  const uid = String(req.user!._id);
  console.log(
    "[velocity link pickup debug]",
    JSON.stringify({
      currentUserId: uid,
      pickupUserId: raw?.userId != null ? String(raw.userId) : "",
      pickupDropshipperId: raw?.dropshipperId != null ? String(raw.dropshipperId) : "",
      requestedWarehouseId: String(oid),
    })
  );
}

export const createWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as VelocityWarehouseRegisterBody;

  if (!(body.linkOnly === true || body.linkOnly === "true")) {
    throw new AppError(
      400,
      'Warehouse creation via API is disabled — create warehouses in the Velocity dashboard. Then link: POST /api/velocity/warehouses with { "linkOnly": true, "warehouseId": "<MongoDB _id>", "velocityWarehouseId": "<Velocity code e.g. WHZBRR>" }'
    );
  }

  if (!body.warehouseId?.trim()) throw new AppError(400, "warehouseId is required for linkOnly");
  const mongoId = body.warehouseId.trim();
  const unlink = body.unlink === true || body.unlink === "true";

  if (!mongoose.isValidObjectId(mongoId)) {
    throw new AppError(400, "warehouseId must be a valid id");
  }
  const oid = new mongoose.Types.ObjectId(mongoId);
  const ownerFilter = getPickupOwnerFilterForUser(req.user);

  if (unlink) {
    const pickupOwned = await Pickup.findOne({ _id: oid, ...ownerFilter }).lean();
    await devLogVelocityLinkPickup(req, oid, pickupOwned);

    if (pickupOwned) {
      await Pickup.findByIdAndUpdate(oid, { $unset: { velocityWarehouseId: 1 } });
      res.json({
        success: true,
        message: "Velocity warehouse unlinked successfully",
        data: { linked: false, unlinked: true, kind: "pickup" },
      });
      return;
    }

    const pickupAny = await Pickup.findById(oid).select("_id").lean();
    if (pickupAny && req.user.role === "dropshipper") {
      throw new AppError(403, "You can only link pickup addresses that belong to your account.");
    }

    const wh = await Warehouse.findById(oid).lean();
    if (!wh) {
      throw new AppError(
        404,
        req.user.role === "dropshipper" ? "Pickup address not found" : "Warehouse or pickup address not found"
      );
    }
    await assertWarehouseAccessForVelocity(req.user, wh);
    await Warehouse.findByIdAndUpdate(oid, { $unset: { velocityWarehouseId: 1 } });
    res.json({
      success: true,
      message: "Velocity warehouse unlinked successfully",
      data: { linked: false, unlinked: true, kind: "warehouse" },
    });
    return;
  }

  const extId = body.velocityWarehouseId;
  if (extId === undefined || extId === null || String(extId).trim() === "") {
    throw new AppError(400, "velocityWarehouseId is required for linkOnly");
  }
  const vid = String(extId).trim();
  if (!VELOCITY_WH_ID_PATTERN.test(vid)) {
    throw new AppError(
      400,
      "velocityWarehouseId must match pattern WH followed by letters or digits (example: WHZBRR)"
    );
  }

  const pickupOwned = await Pickup.findOne({ _id: oid, ...ownerFilter }).lean();
  await devLogVelocityLinkPickup(req, oid, pickupOwned);

  if (pickupOwned) {
    if (req.user.role === "dropshipper") {
      await Pickup.updateOne(
        {
          _id: oid,
          userId: req.user._id,
          $or: [{ dropshipperId: { $exists: false } }, { dropshipperId: null }],
        },
        { $set: { dropshipperId: req.user._id } }
      );
    }
    await Pickup.findByIdAndUpdate(oid, { velocityWarehouseId: vid });
    res.json({
      success: true,
      message: "Velocity warehouse linked successfully",
      data: { warehouse_id: vid, linked: true, manual: true, kind: "pickup" },
    });
    return;
  }

  const pickupAny = await Pickup.findById(oid).select("_id").lean();
  if (pickupAny && req.user.role === "dropshipper") {
    throw new AppError(403, "You can only link pickup addresses that belong to your account.");
  }

  const wh = await Warehouse.findById(oid).lean();
  if (!wh) {
    throw new AppError(
      404,
      req.user.role === "dropshipper" ? "Pickup address not found" : "Warehouse or pickup address not found"
    );
  }
  await assertWarehouseAccessForVelocity(req.user, wh);
  await Warehouse.findByIdAndUpdate(oid, { velocityWarehouseId: vid });
  res.json({
    success: true,
    message: "Velocity warehouse linked successfully",
    data: { warehouse_id: vid, linked: true, manual: true, kind: "warehouse" },
  });
});

// ─── Forward shipment – full orchestration ───────────────

export const createForwardShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  const payload = buildForwardPayload(merged, localOrder);
  validateForwardPayload(payload);

  const result = await velocityService.createForwardShipment(payload);

  if (localOrder) {
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.velocityOrderId = result.order_id;
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.courierName = result.carrier_name;
    localOrder.labelUrl = result.label_url;
    localOrder.manifestUrl = result.manifest_url;
    localOrder.shippingCharges = result.shipping_charges;
    localOrder.codCharges = result.cod_charges;
    localOrder.rtoCharges = result.rto_charges;
    localOrder.shipmentStatus = result.status;
    localOrder.assignedDateTime = new Date();
    localOrder.status = mapVelocityStatus(result.status) || "ready-to-ship";
    localOrder.shipmentCreated = true;
    if (result.awb_code) localOrder.trackingId = result.awb_code;
    if (payload.warehouse_id) localOrder.velocityWarehouseId = String(payload.warehouse_id);
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result, orderId: localOrder?.orderId });
});

// ─── Forward order only (no AWB) ─────────────────────────

export const createForwardOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  const payload = buildForwardPayload(merged, localOrder);
  validateForwardPayload(payload);

  const result = await velocityService.createForwardOrderOnly(payload);

  if (localOrder) {
    localOrder.velocityOrderId = result.order_id;
    localOrder.status = "ready-to-ship";
    if (payload.warehouse_id) localOrder.velocityWarehouseId = String(payload.warehouse_id);
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing forward order ────────────────

export const createForwardShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id, localOrderId } = req.body as {
    order_id?: string;
    carrier_id?: string | number;
    localOrderId?: string;
  };

  if (!order_id) throw new AppError(400, "order_id (Velocity order id) is required");

  const result = await velocityService.createForwardShipmentLater({ order_id, carrier_id });

  if (localOrderId) {
    const localOrder = await Order.findOne({ orderId: localOrderId });
    if (localOrder) {
      await assertOrderAccess(req.user, localOrder);
      localOrder.awb = result.awb_code ?? localOrder.awb;
      localOrder.courier = result.carrier_name ?? localOrder.courier;
      localOrder.velocityShipmentId = result.shipment_id;
      localOrder.courierName = result.carrier_name;
      localOrder.courierCompanyId = result.carrier_id;
      localOrder.labelUrl = result.label_url;
      localOrder.shippingCharges = result.shipping_charges;
      localOrder.codCharges = result.cod_charges;
      localOrder.shipmentStatus = result.status;
      localOrder.assignedDateTime = new Date();
      localOrder.status = mapVelocityStatus(result.status) || "ready-to-ship";
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Reverse / Return – full orchestration ───────────────

export const createReverseShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = req.body as { orderId?: string } & Record<string, unknown>;
  let localOrder: IOrder | null = null;

  if (body.orderId) {
    localOrder = await Order.findOne({ orderId: body.orderId });
    if (!localOrder) throw new AppError(404, `Order ${body.orderId} not found`);
    await assertOrderAccess(req.user, localOrder);
  }

  const merged = await mergeVelocityWarehouse(req, body, localOrder);
  const partial = buildReversePayload(merged, localOrder);
  if (!partial.warehouse_id)
    throw new AppError(
      400,
      "No Velocity warehouse linked. Please link warehouse first."
    );
  if (!partial.pickup_customer) throw new AppError(400, "pickup_customer details are required");

  const result = await velocityService.createReverseShipment(partial as VelocityReverseOrderRequest);

  if (localOrder) {
    localOrder.velocityReturnId = result.return_id;
    localOrder.velocityShipmentId = result.shipment_id;
    localOrder.awb = result.awb_code ?? localOrder.awb;
    localOrder.courier = result.carrier_name ?? localOrder.courier;
    localOrder.courierName = result.carrier_name;
    localOrder.courierCompanyId = result.carrier_id;
    localOrder.labelUrl = result.label_url;
    localOrder.shipmentStatus = result.status;
    localOrder.status = mapVelocityStatus(result.status) || "rto";
    if (partial.warehouse_id) localOrder.velocityWarehouseId = String(partial.warehouse_id);
    await localOrder.save();
  }

  res.status(201).json({ success: true, data: result });
});

// ─── Reverse order only ───────────────────────────────────

export const createReverseOrderOnly = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const merged = await mergeVelocityWarehouse(req, req.body as Record<string, unknown>, null);
  if (!merged.order_id || String(merged.order_id).trim() === "")
    throw new AppError(400, "order_id is required");

  if (!merged.warehouse_id || String(merged.warehouse_id).trim() === "") {
    throw new AppError(
      400,
      "No Velocity warehouse linked. Please link warehouse first."
    );
  }

  const result = await velocityService.createReverseOrderOnly(merged as unknown as VelocityReverseOrderRequest);
  res.status(201).json({ success: true, data: result });
});

// ─── Assign AWB to existing reverse order ────────────────

export const createReverseShipmentLater = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { order_id, carrier_id, localOrderId } = req.body as {
    order_id?: string;
    carrier_id?: string | number;
    localOrderId?: string;
  };

  if (!order_id) throw new AppError(400, "order_id is required");

  const result = await velocityService.createReverseShipmentLater({ order_id, carrier_id });

  if (localOrderId) {
    const localOrder = await Order.findOne({ orderId: localOrderId });
    if (localOrder) {
      await assertOrderAccess(req.user, localOrder);
      localOrder.velocityShipmentId = result.shipment_id;
      localOrder.awb = result.awb_code ?? localOrder.awb;
      localOrder.courier = result.carrier_name ?? localOrder.courier;
      localOrder.courierName = result.carrier_name;
      localOrder.courierCompanyId = result.carrier_id;
      localOrder.labelUrl = result.label_url;
      localOrder.shipmentStatus = result.status;
      localOrder.status = mapVelocityStatus(result.status) || localOrder.status;
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Cancel ──────────────────────────────────────────────

export const cancelShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { awbs, orderId } = req.body as { awbs?: string[]; orderId?: string };
  if (!awbs?.length) throw new AppError(400, "awbs array is required");

  const result = await velocityService.cancelShipment({ awbs });

  if (orderId && result.success) {
    const localOrder = await Order.findOne({ orderId });
    if (localOrder) {
      await assertOrderAccess(req.user, localOrder);
      localOrder.status = "cancelled";
      localOrder.shipmentStatus = "cancelled";
      await localOrder.save();
    }
  }

  res.json({ success: true, data: result });
});

// ─── Tracking (authenticated) ─────────────────────────────

export const trackShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const { awb, orderId } = req.body as { awb?: string; orderId?: string };
  if (!awb) throw new AppError(400, "awb is required");

  if (orderId) {
    const localOrderById = await Order.findOne({ orderId });
    if (localOrderById) await assertOrderAccess(req.user, localOrderById);
  } else {
    const localOrderByAwb = await Order.findOne({ awb });
    if (localOrderByAwb) await assertOrderAccess(req.user, localOrderByAwb);
  }

  const result = await velocityService.trackShipment({ awb });

  const localOrder = await Order.findOne(orderId ? { orderId } : { awb });
  if (localOrder && result.shipment_track_activities?.length) {
    const internalStatus = mapVelocityStatus(result.status);
    localOrder.shipmentStatus = result.status;
    if (internalStatus) localOrder.status = internalStatus;
    localOrder.trackingActivities = result.shipment_track_activities;
    await localOrder.save();
  }

  res.json({
    success: true,
    data: {
      awb: result.awb,
      status: result.status,
      carrierName: result.carrier_name,
      activities: result.shipment_track_activities ?? [],
    },
  });
});

// ─── Tracking – public (no auth) ─────────────────────────

export const trackShipmentPublic = asyncHandler(async (req: Request, res: Response) => {
  const { awb } = req.params as { awb?: string };
  if (!awb) throw new AppError(400, "awb is required");

  const localOrder = await Order.findOne({ $or: [{ awb }, { orderId: awb }] }).lean();
  if (!localOrder) throw new AppError(404, "Order not found");

  const awbToTrack = localOrder.awb || awb;

  if (!awbToTrack) {
    res.json({
      success: true,
      data: {
        awb,
        status: localOrder.status,
        carrierName: localOrder.courierName ?? localOrder.courier,
        activities: localOrder.trackingActivities ?? [],
        order: { id: localOrder.orderId },
        pendingShipment: true,
      },
    });
    return;
  }

  try {
    const result = await velocityService.trackShipment({ awb: awbToTrack });

    await Order.updateOne(
      { _id: localOrder._id },
      {
        shipmentStatus: result.status,
        status: mapVelocityStatus(result.status) || localOrder.status,
        trackingActivities: result.shipment_track_activities,
      }
    );

    res.json({
      success: true,
      data: {
        awb: result.awb,
        status: result.status,
        carrierName: result.carrier_name ?? localOrder.courierName,
        activities: result.shipment_track_activities ?? [],
        trackUrl: (result as { track_url?: string }).track_url,
        order: { id: localOrder.orderId },
      },
    });
  } catch {
    res.json({
      success: true,
      data: {
        awb: awbToTrack,
        status: localOrder.shipmentStatus ?? localOrder.status,
        carrierName: localOrder.courierName ?? localOrder.courier,
        activities: localOrder.trackingActivities ?? [],
        order: { id: localOrder.orderId },
      },
    });
  }
});

// ─── Lists / Reports (admin only) ────────────────────────

export const listVelocityShipments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.listShipments(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [], total: result.total });
});

export const listVelocityReturns = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.listReturns(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [], total: result.total });
});

export const getVelocityReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const result = await velocityService.getReports(req.body as Record<string, unknown>);
  res.json({ success: true, data: result.data ?? [] });
});

// ─── Helpers ─────────────────────────────────────────────

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function firstPositiveNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return NaN;
}

function orderPlain(lo: IOrder | null): Record<string, unknown> {
  if (!lo) return {};
  const doc = lo as unknown as { toObject?: () => Record<string, unknown> };
  if (typeof doc.toObject === "function") return doc.toObject();
  return { ...(lo as unknown as Record<string, unknown>) };
}

function parseWeightKgFromOrder(weight?: string): number {
  if (!weight?.trim()) return 0;
  const m = weight.match(/[\d.]+/);
  return m ? Number.parseFloat(m[0]) : 0;
}

/** First `LxWxH` segment from `dimensions` (may be multiple `;`-separated boxes). */
function parseBoxCmFromDimensions(dimensions?: string): { length: number; width: number; height: number } | undefined {
  if (!dimensions?.trim()) return undefined;
  const first = dimensions.split(";")[0].trim().replace(/cm/gi, "").trim();
  const parts = first.split(/x/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  const nums = parts.map((p) => Number.parseFloat(p)).filter((n) => !Number.isNaN(n));
  if (nums.length < 3) return undefined;
  return { length: nums[0], width: nums[1], height: nums[2] };
}

function resolveShippingRecord(
  bodyCustomer: Record<string, unknown> | undefined,
  o: Record<string, unknown>
): Record<string, unknown> | undefined {
  const fromBody = bodyCustomer?.shippingAddress as Record<string, unknown> | undefined;
  const fromOrder =
    (o.shippingAddress as Record<string, unknown> | undefined) ||
    (o.shipping_address as Record<string, unknown> | undefined);
  return fromBody || fromOrder;
}

/** Maps Order + optional `body.customer` into VelocityCustomer (pincode: up to 6 digits). */
function buildCustomerForForwardPayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): VelocityCustomer {
  const b = body.customer as Record<string, unknown> | undefined;
  const o = orderPlain(localOrder);
  const ship = resolveShippingRecord(b, o);

  const name = firstNonEmpty(
    b?.name,
    o.customerName,
    o.consigneeName,
    ship?.name,
    o.customer,
    localOrder?.customer
  );
  const phone = firstNonEmpty(
    b?.phone,
    o.customerPhone,
    o.phone,
    ship?.phone,
    localOrder?.phone
  );
  const email = firstNonEmpty(b?.email, o.customerEmail, o.email, ship?.email);
  const address = firstNonEmpty(
    b?.address,
    o.customerAddress,
    o.addressLine1,
    ship?.address,
    ship?.street,
    ship?.addressLine1,
    o.address,
    localOrder?.address
  );
  const city = firstNonEmpty(b?.city, o.customerCity, ship?.city, o.city, localOrder?.city);
  const state = firstNonEmpty(
    b?.state,
    b?.shippingState,
    o.customerState,
    o.shippingState,
    ship?.state,
    o.state,
    localOrder?.state
  );
  const pinRaw = firstNonEmpty(
    b?.pincode,
    b?.shippingPincode,
    b?.customerPincode,
    b?.zip,
    b?.postalCode,
    o.customerPincode,
    o.shippingPincode,
    o.pincode,
    o.zip,
    o.postalCode,
    ship?.pincode,
    ship?.zip,
    ship?.postalCode,
    localOrder?.pincode
  );
  const pincode = pinRaw.replace(/\D/g, "").slice(0, 6);
  const country = firstNonEmpty(b?.country, ship?.country, o.country as string) || "India";

  return {
    name,
    phone,
    email: email || undefined,
    address,
    city,
    state,
    pincode,
    country,
  };
}

function mergeForwardCustomer(body: Record<string, unknown>, localOrder: IOrder | null): VelocityCustomer {
  const base = buildCustomerForForwardPayload(body, localOrder);
  const ov = body.customer as Record<string, unknown> | undefined;
  if (!ov || typeof ov !== "object") return base;

  const pinFrom = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 6);

  return {
    name: firstNonEmpty(ov.name, base.name),
    phone: firstNonEmpty(ov.phone, base.phone),
    email: firstNonEmpty(ov.email, base.email ?? "") || undefined,
    address: firstNonEmpty(ov.address, base.address),
    city: firstNonEmpty(ov.city, base.city),
    state: firstNonEmpty(ov.state, base.state),
    pincode: pinFrom(ov.pincode ?? ov.zip) || base.pincode,
    country: firstNonEmpty(ov.country, base.country) || "India",
  };
}

function buildForwardPayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): VelocityForwardOrderRequest {
  const products = localOrder?.products as Array<Record<string, unknown>> | undefined;

  const rawCarrier = body.carrier_id;
  let carrierId: string | number | undefined;
  if (rawCarrier !== undefined && rawCarrier !== null && String(rawCarrier).trim() !== "") {
    const s = String(rawCarrier).trim();
    carrierId = /^\d+$/.test(s) ? Number(s) : s;
  }

  const op = orderPlain(localOrder);
  const ship = (op.shippingAddress as Record<string, unknown> | undefined) ?? undefined;
  const box = parseBoxCmFromDimensions(
    firstNonEmpty(
      String(op.dimensions ?? ""),
      localOrder?.dimensions,
      (ship?.dimensions as string) ?? "",
    )
  );
  const wKg = parseWeightKgFromOrder(firstNonEmpty(String(op.weight ?? ""), localOrder?.weight));

  const weight = firstPositiveNumber(
    body.weight,
    body.packageWeight,
    body.deadWeight,
    op.weight,
    op.packageWeight,
    op.deadWeight,
    wKg,
  );
  const length = firstPositiveNumber(
    body.length,
    body.packageLength,
    op.length,
    op.packageLength,
    box?.length,
  );
  const width = firstPositiveNumber(
    body.width,
    body.breadth,
    body.packageBreadth,
    body.packageWidth,
    op.width,
    op.breadth,
    op.packageBreadth,
    op.packageWidth,
    box?.width,
  );
  const height = firstPositiveNumber(
    body.height,
    body.packageHeight,
    op.height,
    op.packageHeight,
    box?.height,
  );

  const itemsFromBody = body.items as VelocityForwardOrderRequest["items"] | undefined;
  let items: VelocityForwardOrderRequest["items"];
  if (itemsFromBody && Array.isArray(itemsFromBody) && itemsFromBody.length > 0) {
    items = itemsFromBody;
  } else {
    items =
      products?.map((p) => ({
        name: String(p.name ?? "").trim() ? String(p.name) : "",
        qty: Number(p.qty ?? 1),
        price: Number(p.price ?? 0),
        weight: p.weight != null ? Number(p.weight) : undefined,
        sku: p.sku ? String(p.sku) : undefined,
      })) ?? [];
  }

  return {
    warehouse_id:
      (body.warehouse_id as string) ??
      (localOrder?.velocityWarehouseId ?? ""),
    order_id: (body.order_id as string) ?? (localOrder?.orderId ?? ""),
    payment_mode: ((body.payment_mode as string) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? "cod" : "prepaid")) as "cod" | "prepaid",
    cod_amount:
      (body.cod_amount as number) ??
      (localOrder?.payment?.toLowerCase() === "cod" ? localOrder?.amount : undefined),
    order_amount: (body.order_amount as number) ?? (localOrder?.amount ?? 0),
    weight,
    length,
    width,
    height,
    customer: mergeForwardCustomer(body, localOrder),
    items,
    carrier_id: carrierId,
  };
}

function validateForwardPayload(payload: VelocityForwardOrderRequest) {
  const missing: string[] = [];
  if (!payload.warehouse_id) missing.push("linked Velocity warehouse");
  if (!payload.order_id) missing.push("order_id");
  const c = payload.customer;
  const pinDigits = String(c?.pincode ?? "").replace(/\D/g, "");
  if (pinDigits.length !== 6) missing.push("customer pincode");
  if (!String(c?.phone ?? "").trim()) missing.push("customer phone");
  if (!String(c?.address ?? "").trim()) missing.push("delivery address");
  if (!String(c?.city ?? "").trim()) missing.push("customer city");
  if (!String(c?.state ?? "").trim()) missing.push("customer state");
  if (!String(c?.name ?? "").trim()) missing.push("customer name");
  if (!payload.items?.length) missing.push("items");
  const unnamed = payload.items.find((i) => !String(i.name ?? "").trim());
  if (unnamed) {
    throw new AppError(
      400,
      "Each order item must have a name. Please edit the order and fix products."
    );
  }
  if (!(Number(payload.weight) > 0) || Number.isNaN(Number(payload.weight))) missing.push("package weight");
  if (!(Number(payload.length) > 0) || Number.isNaN(Number(payload.length))) missing.push("package length");
  if (!(Number(payload.width) > 0) || Number.isNaN(Number(payload.width))) missing.push("package breadth/width");
  if (!(Number(payload.height) > 0) || Number.isNaN(Number(payload.height))) missing.push("package height");

  if (missing.length) {
    throw new AppError(400, `Missing required shipment fields: ${missing.join(", ")}`);
  }
}

function buildReversePayload(
  body: Record<string, unknown>,
  localOrder: IOrder | null
): Partial<VelocityReverseOrderRequest> {
  const products = localOrder?.products as Array<Record<string, unknown>> | undefined;

  return {
    warehouse_id:
      (body.warehouse_id as string) ??
      (localOrder?.velocityWarehouseId ?? ""),
    order_id: (body.order_id as string) ?? (localOrder?.orderId ?? ""),
    pickup_customer: (body.pickup_customer as VelocityReverseOrderRequest["pickup_customer"]) ?? {
      name: localOrder?.customer ?? "",
      phone: localOrder?.phone ?? "",
      address: localOrder?.address ?? "",
      city: localOrder?.city ?? "",
      state: localOrder?.state ?? "",
      pincode: localOrder?.pincode ?? "",
    },
    weight: (body.weight as number) ?? parseFloat(localOrder?.weight ?? "0.5"),
    length: (body.length as number) ?? 10,
    width: (body.width as number) ?? 10,
    height: (body.height as number) ?? 10,
    items:
      (body.items as VelocityReverseOrderRequest["items"]) ??
      products?.map((p) => ({
        name: String(p.name ?? "Item"),
        qty: Number(p.qty ?? 1),
        price: Number(p.price ?? 0),
      })) ?? [{ name: "Product", qty: 1, price: localOrder?.amount ?? 0 }],
    qc: body.qc as boolean | undefined,
  };
}

async function mergeVelocityWarehouse(
  req: AuthRequest,
  body: Record<string, unknown>,
  localOrder: IOrder | null
): Promise<Record<string, unknown>> {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const out = { ...body };

  const explicit =
    out.warehouse_id != null && String(out.warehouse_id).trim() !== ""
      ? String(out.warehouse_id).trim()
      : "";
  const fromOrder = localOrder?.velocityWarehouseId?.trim() ?? "";

  if (explicit) {
    await assertVelocityWarehouseCodeOwned(req.user, explicit);
    out.warehouse_id = explicit;
    return out;
  }

  if (fromOrder) {
    out.warehouse_id = fromOrder;
    return out;
  }

  const mongoWhId = out.warehouseId ?? out.pickupWarehouseId;
  if (mongoWhId != null && String(mongoWhId).trim() !== "") {
    const id = String(mongoWhId).trim();
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, "Invalid warehouseId");
    }
    const oid = new mongoose.Types.ObjectId(id);
    const ownerFilter = getPickupOwnerFilterForUser(req.user!);

    const puOwned = await Pickup.findOne({ _id: oid, ...ownerFilter }).lean();

    if (req.user!.role === "dropshipper") {
      if (puOwned) {
        if (!puOwned.velocityWarehouseId?.trim()) {
          throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
        }
        out.warehouse_id = puOwned.velocityWarehouseId.trim();
        return out;
      }
      const wh = await Warehouse.findById(oid).lean();
      if (wh) {
        throw new AppError(
          403,
          "Select your linked pickup address for shipments. A vendor warehouse ID cannot be used as a dropshipper."
        );
      }
      throw new AppError(404, "Local warehouse not found");
    }

    const wh = await Warehouse.findById(oid).lean();
    if (wh) {
      await assertWarehouseAccessForVelocity(req.user!, wh);
      if (!wh.velocityWarehouseId?.trim()) {
        throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
      }
      out.warehouse_id = wh.velocityWarehouseId.trim();
      return out;
    }
    if (puOwned) {
      if (!puOwned.velocityWarehouseId?.trim()) {
        throw new AppError(400, "No Velocity warehouse linked. Please link warehouse first.");
      }
      out.warehouse_id = puOwned.velocityWarehouseId.trim();
      return out;
    }
    throw new AppError(404, "Local warehouse not found");
  }

  if (localOrder?.pickupAddressId) {
    const p = await Pickup.findOne({
      _id: localOrder.pickupAddressId,
      ...getPickupOwnerFilterForUser(req.user!),
    }).lean();
    if (p?.velocityWarehouseId?.trim()) {
      out.warehouse_id = p.velocityWarehouseId.trim();
      return out;
    }
  }

  return out;
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
async function assertVelocityWarehouseCodeOwned(
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
      velocityWarehouseId: c,
      $or: [{ userId: user._id }, { dropshipperId: user._id }],
    }).lean();
    if (!p) throw new AppError(403, "Forbidden");
    return;
  }

  throw new AppError(403, "Forbidden");
}

async function assertOrderAccess(user: NonNullable<AuthRequest["user"]>, order: IOrder) {
  if (user.role === "admin") return;

  if (user.role === "dropshipper") {
    if (
      String(order.createdBy) !== String(user._id) &&
      String(order.ownerUserId ?? "") !== String(user._id)
    ) {
      throw new AppError(403, "Forbidden");
    }
    return;
  }

  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ userId: user._id }).select("_id").lean();
    if (!vendor) throw new AppError(403, "Forbidden");
    if (String(order.vendorId ?? "") !== String(vendor._id)) {
      throw new AppError(403, "Forbidden");
    }
    return;
  }

  throw new AppError(403, "Forbidden");
}
