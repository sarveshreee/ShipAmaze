import type { Request, Response } from "express";
import type { Types } from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Order } from "../models/Order.js";
import { Courier } from "../models/Courier.js";
import { Warehouse } from "../models/Warehouse.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { Pickup } from "../models/Pickup.js";

function mapOrder(o: {
  orderId: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  weight: string;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: unknown[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: string;
  pickupAddressId?: Types.ObjectId;
  createdAt?: Date;
  channel?: string;
  externalSource?: string;
  externalOrderName?: string;
  shipmentCreated?: boolean;
  shipmentId?: string;
  trackingId?: string;
  isJunk?: boolean;
  junkedAt?: Date;
  junkReason?: string;
  shipmentStatus?: string;
  movedToReadyAt?: Date;
}) {
  return {
    id: o.orderId,
    customer: o.customer,
    phone: o.phone,
    address: o.address,
    city: o.city,
    pincode: o.pincode,
    weight: o.weight,
    courier: o.courier,
    payment: o.payment,
    status: o.status,
    date: o.date,
    awb: o.awb,
    amount: o.amount,
    products: o.products,
    dimensions: o.dimensions,
    zone: o.zone,
    pickupAddress: o.pickupAddress,
    pickupAddressId: o.pickupAddressId ? String(o.pickupAddressId) : undefined,
    createdAt: o.createdAt,
    channel: o.channel ?? "Manual",
    externalSource: o.externalSource,
    externalOrderName: o.externalOrderName,
    shipmentCreated: Boolean(o.shipmentCreated),
    shipmentId: o.shipmentId,
    trackingId: o.trackingId,
    isJunk: Boolean(o.isJunk),
    junkedAt: o.junkedAt,
    junkReason: o.junkReason,
    shipmentStatus: o.shipmentStatus,
    movedToReadyAt: o.movedToReadyAt,
  };
}

async function vendorDocForUser(userId: Types.ObjectId) {
  return Vendor.findOne({ userId });
}

export const listOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  let query: Record<string, unknown> = {};
  const view = String(req.query.view ?? "").toLowerCase();
  if (req.user.role === "vendor") {
    const v = await vendorDocForUser(req.user._id);
    if (v) query = { vendorId: v._id };
    else query = { createdBy: req.user._id };
  } else if (req.user.role === "dropshipper") {
    query = { createdBy: req.user._id };
  }
  if (view === "junk") {
    query = { ...query, isJunk: true };
  } else {
    query = { ...query, isJunk: { $ne: true } };
  }
  const rows = await Order.find(query).sort({ createdAt: -1 }).lean();
  res.json(rows.map((o) => mapOrder(o)));
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const orderId = (body.orderId as string) || `SF${Date.now()}`;
  const vendor =
    req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;

  let pickupAddressId: Types.ObjectId | undefined;
  const rawPid = body.pickupAddressId;
  if (rawPid != null && String(rawPid).trim() !== "") {
    if (!mongoose.isValidObjectId(String(rawPid))) throw new AppError(400, "Invalid pickupAddressId");
    const p = await Pickup.findOne({
      _id: String(rawPid),
      userId: req.user._id,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    });
    if (!p) throw new AppError(400, "Pickup address not found or not allowed");
    pickupAddressId = p._id;
  }

  const doc = await Order.create({
    orderId,
    customer: String(body.customer ?? ""),
    phone: String(body.phone ?? ""),
    address: String(body.address ?? ""),
    city: String(body.city ?? ""),
    pincode: String(body.pincode ?? ""),
    weight: String(body.weight ?? ""),
    courier: String(body.courier ?? "Delhivery"),
    payment: String(body.payment ?? "Prepaid"),
    status: String(body.status ?? "pending"),
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    awb: String(body.awb ?? ""),
    amount: Number(body.amount ?? 0),
    products: (body.products as unknown[]) ?? [],
    dimensions: body.dimensions as string | undefined,
    zone: body.zone as string | undefined,
    pickupAddress: body.pickupAddress as string | undefined,
    pickupAddressId,
    createdBy: req.user._id,
    vendorId: vendor?._id,
    channel: String(body.channel ?? "Manual"),
  });
  res.status(201).json(mapOrder(doc));
});

export const createOrdersBulk = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const items = (req.body as { orders?: unknown[] }).orders;
  if (!Array.isArray(items)) throw new AppError(400, "Expected { orders: [] }");
  const vendor =
    req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;
  const created = [];
  for (const raw of items) {
    const body = raw as Record<string, unknown>;
    const orderId = (body.orderId as string) || `SF${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const doc = await Order.create({
      orderId,
      customer: String(body.customer ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      city: String(body.city ?? ""),
      pincode: String(body.pincode ?? ""),
      weight: String(body.weight ?? ""),
      courier: String(body.courier ?? "Delhivery"),
      payment: String(body.payment ?? "Prepaid"),
      status: String(body.status ?? "pending"),
      date: String(body.date ?? new Date().toISOString().slice(0, 10)),
      awb: String(body.awb ?? ""),
      amount: Number(body.amount ?? 0),
      products: (body.products as unknown[]) ?? [],
      dimensions: body.dimensions as string | undefined,
      zone: body.zone as string | undefined,
      pickupAddress: body.pickupAddress as string | undefined,
      createdBy: req.user._id,
      vendorId: vendor?._id,
      channel: String(body.channel ?? "Manual"),
    });
    created.push(mapOrder(doc));
  }
  res.status(201).json({ created: created.length, orders: created });
});

export const createShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId, courierId, warehouseId } = req.body as {
    orderId?: string;
    courierId?: string;
    warehouseId?: string;
  };
  if (!orderId || !courierId || !warehouseId) {
    throw new AppError(400, "orderId, courierId and warehouseId are required");
  }

  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");
  if (req.user.role === "dropshipper" && String(order.createdBy) !== String(req.user._id)) {
    throw new AppError(403, "Forbidden");
  }
  if (order.shipmentCreated) throw new AppError(400, "Shipment already created for this order");
  if (order.isJunk) throw new AppError(400, "Cannot create shipment for junk order");

  const courier = await Courier.findById(courierId).lean();
  if (!courier) throw new AppError(404, "Courier not found");
  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) throw new AppError(404, "Warehouse not found");

  const shipmentId = `SHP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const trackingId = `TRK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  order.shipmentCreated = true;
  order.shipmentId = shipmentId;
  order.trackingId = trackingId;
  order.courier = courier.name;
  order.status = "shipped";
  order.isJunk = false;
  order.pickupAddress = warehouse.name || order.pickupAddress;
  await order.save();

  res.json({
    success: true,
    trackingId,
    shipmentId,
  });
});

/** Statuses that must not be manually pushed to Ready to Ship (already shipped / in pipeline / terminal). */
const BLOCKED_BULK_MOVE_TO_READY = new Set([
  "shipped",
  "in-transit",
  "out-for-delivery",
  "delivered",
  "pending-pickup",
  "failed",
  "reship",
  "junk",
  "cancelled",
  "rto",
  "ndr",
]);

export const bulkMoveOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as { orderIds?: unknown; targetStatus?: unknown };
  const orderIds = body.orderIds;
  const targetStatus = body.targetStatus;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError(400, "orderIds must be a non-empty array");
  }
  if (targetStatus !== "ready_to_ship") {
    throw new AppError(400, "targetStatus must be ready_to_ship");
  }

  const ids = [...new Set(orderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError(400, "orderIds must not be empty");

  const orders = await Order.find({ orderId: { $in: ids } }).exec();
  if (orders.length !== ids.length) {
    throw new AppError(404, "One or more orders were not found");
  }

  for (const order of orders) {
    if (req.user.role === "dropshipper" && String(order.createdBy) !== String(req.user._id)) {
      throw new AppError(403, "Forbidden");
    }

    if (order.isJunk) {
      throw new AppError(400, "Cannot move junk orders to Ready to Ship");
    }
    if (order.shipmentCreated) {
      throw new AppError(400, "Cannot manually move orders that already have a shipment");
    }
    const st = String(order.status || "").toLowerCase();
    if (BLOCKED_BULK_MOVE_TO_READY.has(st)) {
      throw new AppError(
        400,
        `Order ${order.orderId} cannot be moved to Ready to Ship from status "${order.status}"`
      );
    }
  }

  const now = new Date();
  const result = await Order.updateMany(
    { orderId: { $in: ids } },
    {
      $set: {
        status: "ready-to-ship",
        shipmentStatus: "ready_to_ship",
        movedToReadyAt: now,
      },
    }
  );

  res.json({
    success: true,
    updatedCount: result.matchedCount ?? ids.length,
  });
});

export const markOrderJunk = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id } = req.params;
  const { junkReason } = req.body as { junkReason?: string };
  const order = await Order.findOne({ orderId: id });
  if (!order) throw new AppError(404, "Order not found");
  if (req.user.role === "dropshipper" && String(order.createdBy) !== String(req.user._id)) {
    throw new AppError(403, "Forbidden");
  }

  order.isJunk = true;
  order.junkedAt = new Date();
  order.junkReason = junkReason?.trim() || order.junkReason;
  order.status = "junk";
  await order.save();

  res.json({
    success: true,
    message: "Order moved to junk",
  });
});

export const updateOrderStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const { status } = req.body as { status?: string };
  if (!status) throw new AppError(400, "status required");
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  if (req.user.role === "dropshipper" && String(o.createdBy) !== String(req.user._id)) {
    throw new AppError(403, "Forbidden");
  }
  o.status = status;
  await o.save();
  res.json(mapOrder(o));
});

export const trackOrderByAwb = asyncHandler(async (req: Request, res: Response) => {
  const { awb } = req.params;
  const o = await Order.findOne({ awb });
  if (!o) throw new AppError(404, "Order not found");
  res.json(mapOrder(o));
});

/** Public tracking by business order id */
export const publicOrderByOrderId = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  res.json(mapOrder(o));
});

export const getOrderById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  res.json(mapOrder(o));
});
