import type { Request, Response } from "express";
import type { Types } from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { Order } from "../models/Order.js";
import { Vendor } from "../models/Vendor.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";

function mapOrder(o: { orderId: string; customer: string; phone: string; address: string; city: string; pincode: string; weight: string; courier: string; payment: string; status: string; date: string; awb: string; amount: number; products: unknown[]; dimensions?: string; zone?: string; pickupAddress?: string; createdAt?: Date }) {
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
    createdAt: o.createdAt,
  };
}

async function vendorDocForUser(userId: Types.ObjectId) {
  return Vendor.findOne({ userId });
}

export const listOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  let query: Record<string, unknown> = {};
  if (req.user.role === "vendor") {
    const v = await vendorDocForUser(req.user._id);
    if (v) query = { vendorId: v._id };
    else query = { createdBy: req.user._id };
  } else if (req.user.role === "dropshipper") {
    query = { createdBy: req.user._id };
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
    });
    created.push(mapOrder(doc));
  }
  res.status(201).json({ created: created.length, orders: created });
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
