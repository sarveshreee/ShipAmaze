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
  state?: string;
  pincode: string;
  weight: string;
  length?: number;
  width?: number;
  breadth?: number;
  height?: number;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  products: unknown[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: unknown;
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
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingPincode?: string;
  shippingCity?: string;
  shippingState?: string;
  velocityWarehouseId?: string;
  velocityOrderId?: string;
  velocityShipmentId?: string;
  velocityReturnId?: string;
  courierCompanyId?: number | string;
  courierName?: string;
  labelUrl?: string;
  manifestUrl?: string;
  shippingCharges?: number;
  codCharges?: number;
  rtoCharges?: number;
  trackingUrl?: string;
  trackingActivities?: { date: string; activity: string; location: string }[];
}) {
  return {
    id: o.orderId,
    customer: o.customer,
    phone: o.phone,
    address: o.address,
    city: o.city,
    state: o.state,
    pincode: o.pincode,
    weight: o.weight,
    length: o.length,
    width: o.width,
    breadth: o.breadth,
    height: o.height,
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
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    shippingAddress1: o.shippingAddress1,
    shippingAddress2: o.shippingAddress2,
    shippingPincode: o.shippingPincode,
    shippingCity: o.shippingCity,
    shippingState: o.shippingState,
    velocityWarehouseId: o.velocityWarehouseId,
    velocityOrderId: o.velocityOrderId,
    velocityShipmentId: o.velocityShipmentId,
    velocityReturnId: o.velocityReturnId,
    courierCompanyId: o.courierCompanyId,
    courierName: o.courierName,
    labelUrl: o.labelUrl,
    manifestUrl: o.manifestUrl,
    shippingCharges: o.shippingCharges,
    codCharges: o.codCharges,
    rtoCharges: o.rtoCharges,
    trackingUrl: o.trackingUrl,
    trackingActivities: o.trackingActivities,
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
    query = {
      $or: [
        { ownerUserId: req.user._id },
        { createdBy: req.user._id },
        { dropshipperId: req.user._id },
      ],
    };
  }
  if (view === "junk") {
    query = { ...query, isJunk: true };
  } else {
    query = { ...query, isJunk: { $ne: true } };
  }
  console.log("[orders:list] userId=", String(req.user._id), "role=", req.user.role, "query=", JSON.stringify(query));
  const rows = await Order.find(query).sort({ createdAt: -1 }).lean();
  console.log("[orders:list] returned_count=", rows.length);
  res.json(rows.map((o) => mapOrder(o)));
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const orderId = (body.orderId as string) || `SF${Date.now()}`;
  const existingOrder = await Order.findOne({ orderId });
  if (existingOrder) throw new AppError(400, `Order ID "${orderId}" already exists. Please use a different order ID.`);
  const vendor =
    req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;

  let pickupAddressId: Types.ObjectId | undefined;
  const rawPid = body.pickupAddressId ?? body.pickupWarehouseId;
  if (rawPid != null && String(rawPid).trim() !== "") {
    if (!mongoose.isValidObjectId(String(rawPid))) throw new AppError(400, "Invalid pickupAddressId");
    const active = { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
    const p =
      req.user.role === "dropshipper"
        ? await Pickup.findOne({
            _id: String(rawPid),
            $and: [{ $or: [{ userId: req.user._id }, { dropshipperId: req.user._id }] }, active],
          })
        : await Pickup.findOne({
            _id: String(rawPid),
            userId: req.user._id,
            ...active,
          });
    if (!p) throw new AppError(400, "Pickup address not found or not allowed");
    pickupAddressId = p._id;
  }

  let snapshotVelocityWh: string | undefined;
  let pickupSnapshot:
    | {
        id: string;
        label: string;
        contactName?: string;
        phone?: string;
        email?: string;
        address?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
        velocityWarehouseId?: string;
      }
    | undefined;
  if (pickupAddressId) {
    const pu = await Pickup.findById(pickupAddressId)
      .select("label contactName phone email addressLine1 addressLine2 city state pincode country velocityWarehouseId")
      .lean();
    snapshotVelocityWh = pu?.velocityWarehouseId?.trim();
    if (pu) {
      pickupSnapshot = {
        id: String(pickupAddressId),
        label: pu.label || "Pickup Address",
        contactName: pu.contactName || "",
        phone: pu.phone || "",
        email: pu.email || "",
        address: [pu.addressLine1, pu.addressLine2].filter(Boolean).join(", "),
        city: pu.city || "",
        state: pu.state || "",
        pincode: pu.pincode || "",
        country: pu.country || "India",
        velocityWarehouseId: snapshotVelocityWh,
      };
    }
  }
  const rawCarrierPref = body.carrier_id;
  let carrierPref: string | number | undefined;
  if (rawCarrierPref !== undefined && rawCarrierPref !== null && String(rawCarrierPref).trim() !== "") {
    const s = String(rawCarrierPref).trim();
    carrierPref = /^\d+$/.test(s) ? Number(s) : s;
  }

  const shippingAddress1 = String(body.shippingAddress1 ?? body.addressLine1 ?? body.address ?? "");
  const shippingAddress2 = String(body.shippingAddress2 ?? body.addressLine2 ?? "");
  const shippingCity = String(body.shippingCity ?? body.city ?? "");
  const shippingState = String(body.shippingState ?? body.state ?? "");
  const shippingPincode = String(body.shippingPincode ?? body.pincode ?? "");
  const shippingPincodeDigits = shippingPincode.replace(/\D/g, "").slice(0, 6);
  const rawLength = Number(body.length ?? 0);
  const rawWidth = Number(body.width ?? body.breadth ?? 0);
  const rawHeight = Number(body.height ?? 0);

  const payment = String(body.payment ?? "Prepaid");
  if (!["COD", "Prepaid"].includes(payment)) {
    throw new AppError(400, "payment must be COD or Prepaid");
  }
  if (!shippingState.trim()) throw new AppError(400, "shippingState/state is required");
  if (!/^\d{6}$/.test(shippingPincodeDigits)) {
    throw new AppError(400, "shippingPincode/pincode must be exactly 6 digits");
  }
  const normalizedWeight = Number(String(body.weight ?? "").replace(/[^\d.]/g, ""));
  if (!(normalizedWeight > 0)) throw new AppError(400, "weight must be greater than 0");
  if (!(rawLength > 0) || !(rawWidth > 0) || !(rawHeight > 0)) {
    throw new AppError(400, "length, breadth/width and height must be greater than 0");
  }
  if (!pickupAddressId) {
    throw new AppError(400, "pickupAddressId is required and must belong to your account");
  }

  const doc = await Order.create({
    orderId,
    customer: String(body.customer ?? ""),
    phone: String(body.phone ?? ""),
    address: shippingAddress1 || String(body.address ?? ""),
    city: shippingCity,
    state: shippingState,
    pincode: shippingPincodeDigits,
    weight: String(normalizedWeight),
    length: rawLength > 0 ? rawLength : undefined,
    width: rawWidth > 0 ? rawWidth : undefined,
    breadth: rawWidth > 0 ? rawWidth : undefined,
    height: rawHeight > 0 ? rawHeight : undefined,
    courier: String(body.courier ?? "Delhivery"),
    payment,
    status: String(body.status ?? "pending"),
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    awb: String(body.awb ?? ""),
    amount: Number(body.amount ?? 0),
    products: (body.products as unknown[]) ?? [],
    items: (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
    orderItems: (body.orderItems as unknown[]) ?? (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
    dimensions: body.dimensions as string | undefined,
    zone: body.zone as string | undefined,
    pickupAddress: pickupSnapshot ?? (body.pickupAddress as string | undefined),
    pickupAddressId,
    createdBy: req.user._id,
    ownerUserId: req.user._id,
    vendorId: vendor?._id,
    channel: String(body.channel ?? "Manual"),
    customerEmail: String(body.customerEmail ?? body.email ?? ""),
    customerPhone: String(body.customerPhone ?? body.phone ?? ""),
    shippingAddress1,
    shippingAddress2,
    shippingPincode: shippingPincodeDigits,
    shippingCity,
    shippingState,
    velocityWarehouseId: snapshotVelocityWh,
    courierCompanyId: carrierPref,
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
    const exists = await Order.findOne({ orderId });
    if (exists) throw new AppError(400, `Order ID "${orderId}" already exists.`);
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
      items: (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
      orderItems: (body.orderItems as unknown[]) ?? (body.items as unknown[]) ?? (body.products as unknown[]) ?? [],
      dimensions: body.dimensions as string | undefined,
      zone: body.zone as string | undefined,
      pickupAddress: body.pickupAddress as string | undefined,
      createdBy: req.user._id,
      ownerUserId: req.user._id,
      vendorId: vendor?._id,
      channel: String(body.channel ?? "Manual"),
    });
    created.push(mapOrder(doc));
  }
  res.status(201).json({ created: created.length, orders: created });
});

export const updateOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const body = req.body as Record<string, unknown>;
  const order = await Order.findOne({ orderId });
  if (!order) throw new AppError(404, "Order not found");

  if (req.user.role === "dropshipper") {
    const owned =
      String(order.createdBy) === String(req.user._id) ||
      String(order.ownerUserId ?? "") === String(req.user._id) ||
      String((order as unknown as { dropshipperId?: unknown }).dropshipperId ?? "") === String(req.user._id);
    if (!owned) throw new AppError(403, "Forbidden");
  } else if (req.user.role === "vendor") {
    const v = await vendorDocForUser(req.user._id);
    if (v && String(order.vendorId ?? "") !== String(v._id)) throw new AppError(403, "Forbidden");
  }

  const customerName = String(body.customerName ?? body.consigneeName ?? body.customer ?? "").trim();
  const customerEmail = String(body.customerEmail ?? body.email ?? "").trim();
  const customerPhoneRaw = String(body.customerPhone ?? body.phone ?? "").trim();
  const shippingAddress1 = String(body.shippingAddress1 ?? body.address1 ?? body.address ?? "").trim();
  const shippingAddress2 = String(body.shippingAddress2 ?? body.address2 ?? "").trim();
  const shippingCity = String(body.shippingCity ?? body.city ?? "").trim();
  const shippingState = String(body.shippingState ?? body.state ?? "").trim();
  const shippingPincode = String(body.shippingPincode ?? body.customerPincode ?? body.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const rawWeight = Number(body.weight ?? body.packageWeight ?? body.deadWeight ?? NaN);
  const rawLength = Number(body.length ?? body.packageLength ?? NaN);
  const rawWidth = Number(body.breadth ?? body.width ?? body.packageBreadth ?? body.packageWidth ?? NaN);
  const rawHeight = Number(body.height ?? body.packageHeight ?? NaN);

  if (shippingPincode && !/^\d{6}$/.test(shippingPincode)) {
    throw new AppError(400, "shippingPincode must be exactly 6 digits");
  }
  if (customerPhoneRaw) {
    const digits = customerPhoneRaw.replace(/\D/g, "");
    if (digits.length < 10) throw new AppError(400, "customerPhone must be a valid phone number");
  }
  if (!Number.isNaN(rawWeight) && rawWeight <= 0) throw new AppError(400, "weight must be greater than 0");
  if (!Number.isNaN(rawLength) && rawLength <= 0) throw new AppError(400, "length must be greater than 0");
  if (!Number.isNaN(rawWidth) && rawWidth <= 0) throw new AppError(400, "breadth/width must be greater than 0");
  if (!Number.isNaN(rawHeight) && rawHeight <= 0) throw new AppError(400, "height must be greater than 0");

  if (customerName) order.customer = customerName;
  if (customerEmail || body.customerEmail === "" || body.email === "") order.customerEmail = customerEmail;
  if (customerPhoneRaw) {
    order.customerPhone = customerPhoneRaw;
    order.phone = customerPhoneRaw;
  }
  if (shippingAddress1) {
    order.shippingAddress1 = shippingAddress1;
    order.address = [shippingAddress1, shippingAddress2 || order.shippingAddress2 || ""].filter(Boolean).join(", ");
  }
  if (shippingAddress2 || body.shippingAddress2 === "" || body.address2 === "") {
    order.shippingAddress2 = shippingAddress2;
    order.address = [order.shippingAddress1 || shippingAddress1 || "", shippingAddress2].filter(Boolean).join(", ");
  }
  if (shippingCity) {
    order.shippingCity = shippingCity;
    order.city = shippingCity;
  }
  if (shippingState) {
    order.shippingState = shippingState;
    order.state = shippingState;
  }
  if (shippingPincode) {
    order.shippingPincode = shippingPincode;
    order.pincode = shippingPincode;
  }
  if (!Number.isNaN(rawWeight) && rawWeight > 0) {
    order.weight = String(rawWeight);
  }
  if (!Number.isNaN(rawLength) && rawLength > 0) order.length = rawLength;
  if (!Number.isNaN(rawWidth) && rawWidth > 0) {
    order.width = rawWidth;
    order.breadth = rawWidth;
  }
  if (!Number.isNaN(rawHeight) && rawHeight > 0) order.height = rawHeight;

  const l = order.length;
  const w = order.width ?? order.breadth;
  const h = order.height;
  if (l && w && h) {
    order.dimensions = `${l}x${w}x${h} cm`;
  }

  await order.save();
  res.json(mapOrder(order));
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
