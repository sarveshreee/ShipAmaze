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
import { pickupByIdSelectableQuery } from "../utils/pickupQuery.js";
import { normalizeOrderStatus, isValidStatusTransition } from "../utils/orderStatus.js";
import {
  buildOrderVisibilityQuery,
  buildTabQuery,
  mergeQueries,
  parseOrderListQuery,
  buildOrderListFiltersQuery,
} from "../utils/orderFilters.js";
import type { IOrder } from "../models/Order.js";

function normalizePickupAddressForClient(pickup: unknown): unknown {
  if (pickup == null) return pickup;
  if (typeof pickup === "string") {
    const t = pickup.trim();
    return t || undefined;
  }
  if (typeof pickup !== "object" || Array.isArray(pickup)) return pickup;
  const o = pickup as Record<string, unknown>;
  const label = String(o.label ?? "").trim();
  const warehouseName = String(o.warehouseName ?? "").trim();
  const title = label || warehouseName || "Pickup";
  const contactName = String(o.contactName ?? o.contactPerson ?? "").trim();
  return {
    ...o,
    label: title,
    warehouseName: warehouseName || title,
    pickupName: warehouseName || title,
    contactName,
    contactPerson: contactName,
  };
}

function buildPickupSnapshotFromLean(
  pu: {
    label?: string;
    contactName?: string;
    phone?: string;
    alternatePhone?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    gstin?: string;
    velocityWarehouseId?: string;
  },
  pickupAddressId: Types.ObjectId
): {
  snapshot: {
    id: string;
    label: string;
    warehouseName: string;
    pickupName: string;
    contactName: string;
    contactPerson: string;
    phone: string;
    alternatePhone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gstin: string;
    velocityWarehouseId?: string;
  };
  velocityWarehouseId?: string;
} {
  const label = pu.label || "Pickup Address";
  const snapshotVelocityWh = pu.velocityWarehouseId?.trim();
  const contact = pu.contactName || "";
  return {
    snapshot: {
      id: String(pickupAddressId),
      label,
      warehouseName: label,
      pickupName: label,
      contactName: contact,
      contactPerson: contact,
      phone: pu.phone || "",
      alternatePhone: pu.alternatePhone || "",
      email: pu.email || "",
      address: [pu.addressLine1, pu.addressLine2, pu.landmark].filter(Boolean).join(", "),
      city: pu.city || "",
      state: pu.state || "",
      pincode: pu.pincode || "",
      country: pu.country || "India",
      gstin: pu.gstin || "",
      velocityWarehouseId: snapshotVelocityWh,
    },
    velocityWarehouseId: snapshotVelocityWh,
  };
}

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
  pickupWarehouseId?: string;
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
  items?: unknown[];
  orderItems?: unknown[];
  shopifyLineItems?: unknown[];
  statusHistory?: { status: string; at: Date; updatedBy?: unknown; note?: string }[];
  sourceType?: string;
  updatedAt?: Date;
  shopifyShopDomain?: string;
  shopifyOrderNumericId?: string;
  shopifyFinancialStatus?: string;
  shopifyFulfillmentStatus?: string;
  shopifyNote?: string;
  shopifyTags?: string;
  lastShopifySyncAt?: Date;
}) {
  const items = (o.orderItems ?? o.items ?? o.products ?? []) as unknown[];
  const productsOut = Array.isArray(o.products) && o.products.length > 0 ? o.products : items;
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
    products: productsOut,
    dimensions: o.dimensions,
    zone: o.zone,
    pickupAddress: normalizePickupAddressForClient(o.pickupAddress),
    pickupAddressId: o.pickupAddressId ? String(o.pickupAddressId) : undefined,
    pickupWarehouseId: o.pickupWarehouseId,
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
    items,
    orderItems: (o.orderItems ?? items) as unknown[],
    shopifyLineItems: o.shopifyLineItems,
    statusHistory: (o.statusHistory ?? []).map((e) => ({
      status: e.status,
      at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
      updatedBy: e.updatedBy ? String(e.updatedBy) : undefined,
      note: e.note,
    })),
    sourceType: o.sourceType ?? o.channel ?? "Manual",
    updatedAt: o.updatedAt,
    shopifyShopDomain: o.shopifyShopDomain,
    shopifyOrderNumericId: o.shopifyOrderNumericId,
    shopifyFinancialStatus: o.shopifyFinancialStatus,
    shopifyFulfillmentStatus: o.shopifyFulfillmentStatus,
    shopifyNote: o.shopifyNote,
    shopifyTags: o.shopifyTags,
    lastShopifySyncAt:
      o.lastShopifySyncAt instanceof Date ? o.lastShopifySyncAt.toISOString() : o.lastShopifySyncAt
        ? String(o.lastShopifySyncAt)
        : undefined,
  };
}

async function vendorDocForUser(userId: Types.ObjectId) {
  return Vendor.findOne({ userId });
}

async function assertOrderAccess(
  user: NonNullable<AuthRequest["user"]>,
  order: {
    createdBy?: unknown;
    ownerUserId?: unknown;
    vendorId?: unknown;
    dropshipperId?: unknown;
  }
) {
  if (user.role === "admin") return;
  if (user.role === "vendor") {
    const v = await vendorDocForUser(user._id);
    if (v && String(order.vendorId ?? "") === String(v._id)) return;
    if (String(order.createdBy) === String(user._id)) return;
    throw new AppError(403, "Forbidden");
  }
  const owned =
    String(order.createdBy) === String(user._id) ||
    String(order.ownerUserId ?? "") === String(user._id) ||
    String(order.dropshipperId ?? "") === String(user._id);
  if (!owned) throw new AppError(403, "Forbidden");
}

function appendStatusHistory(order: IOrder, status: string, userId: Types.ObjectId | undefined, note?: string) {
  const ev = { status, at: new Date(), updatedBy: userId, note };
  const h = order.statusHistory ?? [];
  h.push(ev);
  order.statusHistory = h;
  order.markModified("statusHistory");
}

function extractItemsFromBody(body: Record<string, unknown>): unknown[] {
  const raw = (body.orderItems ?? body.items ?? body.products) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row !== null && row !== undefined);
}

function validateOrderItems(items: unknown[]): void {
  if (items.length === 0) throw new AppError(400, "At least one order line item is required");
  for (const row of items) {
    const o = row as Record<string, unknown>;
    const name = String(o.name ?? o.title ?? "").trim();
    const qty = Number(o.qty ?? o.quantity ?? o.units ?? 0);
    const price = Number(o.price ?? o.sellingPrice ?? o.amount ?? 0);
    if (!name) throw new AppError(400, "Each item must have a name");
    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      throw new AppError(400, "Each item must have a valid quantity (whole number ≥ 1)");
    }
    if (!Number.isFinite(price) || price < 0) throw new AppError(400, "Each item must have a valid price (≥ 0)");
  }
}

function sumItemsAmount(items: unknown[]): number {
  let t = 0;
  for (const row of items) {
    const o = row as Record<string, unknown>;
    const qty = Number(o.qty ?? o.quantity ?? o.units ?? 1);
    const price = Number(o.price ?? o.sellingPrice ?? o.amount ?? 0);
    t += qty * price;
  }
  return Math.round(t * 100) / 100;
}

export const listOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  if (String(req.query.legacy ?? "") === "1") {
    const visibility = await buildOrderVisibilityQuery(req.user);
    const view = String(req.query.view ?? "").toLowerCase();
    let query: Record<string, unknown> = { ...visibility };
    if (view === "junk") query = mergeQueries(query, { isJunk: true });
    else query = mergeQueries(query, { isJunk: { $ne: true } });
    const rows = await Order.find(query).sort({ createdAt: -1 }).lean();
    res.json(rows.map((o) => mapOrder(o)));
    return;
  }

  const view = String(req.query.view ?? "").toLowerCase();
  const pq = parseOrderListQuery(req.query as Record<string, unknown>);
  const visibility = await buildOrderVisibilityQuery(req.user);

  let query: Record<string, unknown> = { ...visibility };
  if (view === "junk") query = mergeQueries(query, { isJunk: true });
  else query = mergeQueries(query, { isJunk: { $ne: true } });

  if (view !== "junk" && pq.tab) {
    const tq = buildTabQuery(pq.tab);
    if (tq) query = mergeQueries(query, tq);
  }

  const listFilters = buildOrderListFiltersQuery(pq);
  if (listFilters) query = mergeQueries(query, listFilters);

  let tabCounts: Record<string, number> | undefined;
  if (pq.counts && view !== "junk") {
    const tabs = [
      "all",
      "channel",
      "manual",
      "ready-to-ship",
      "pending-pickup",
      "in-transit",
      "out-for-delivery",
      "delivered",
      "reship",
      "failed",
    ];
    tabCounts = {};
    for (const tab of tabs) {
      let q2: Record<string, unknown> = { ...visibility, isJunk: { $ne: true } };
      const tq = buildTabQuery(tab);
      if (tq) q2 = mergeQueries(q2, tq);
      if (listFilters) q2 = mergeQueries(q2, listFilters);
      tabCounts[tab] = await Order.countDocuments(q2);
    }
    tabCounts.junk = await Order.countDocuments(mergeQueries({ ...visibility }, { isJunk: true }));
  }

  const skip = (pq.page - 1) * pq.pageSize;
  const [rows, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(pq.pageSize).lean(),
    Order.countDocuments(query),
  ]);

  res.json({
    orders: rows.map((o) => mapOrder(o)),
    total,
    page: pq.page,
    pageSize: pq.pageSize,
    ...(tabCounts ? { tabCounts } : {}),
  });
});

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = req.body as Record<string, unknown>;
  const vendor = req.user.role === "vendor" ? await vendorDocForUser(req.user._id) : null;

  const requestedId = String(body.orderId ?? "").trim();
  const orderId =
    requestedId || `SA-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const existingOrder = await Order.findOne({ orderId });
  if (existingOrder) {
    throw new AppError(400, `Order ID "${orderId}" already exists. Please use a different order ID.`);
  }

  const isDraft = String(body.status ?? "").toLowerCase() === "draft" || body.isDraft === true;

  let pickupAddressId: Types.ObjectId | undefined;
  const rawPid = body.pickupAddressId ?? body.pickupWarehouseId;
  if (rawPid != null && String(rawPid).trim() !== "") {
    if (!mongoose.isValidObjectId(String(rawPid))) throw new AppError(400, "Invalid pickupAddressId");
    const p = await Pickup.findOne(pickupByIdSelectableQuery(String(rawPid), req.user));
    if (!p) throw new AppError(400, "Pickup address not found or not allowed");
    pickupAddressId = p._id;
  }

  let snapshotVelocityWh: string | undefined;
  let pickupSnapshot: ReturnType<typeof buildPickupSnapshotFromLean>["snapshot"] | undefined;
  if (pickupAddressId) {
    const pu = await Pickup.findById(pickupAddressId)
      .select(
        "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId"
      )
      .lean();
    if (pu) {
      const built = buildPickupSnapshotFromLean(pu, pickupAddressId);
      pickupSnapshot = built.snapshot;
      snapshotVelocityWh = built.velocityWarehouseId;
    }
  }

  const rawCarrierPref = body.carrier_id;
  let carrierPref: string | number | undefined;
  if (rawCarrierPref !== undefined && rawCarrierPref !== null && String(rawCarrierPref).trim() !== "") {
    const s = String(rawCarrierPref).trim();
    carrierPref = /^\d+$/.test(s) ? Number(s) : s;
  }

  const lineItems = extractItemsFromBody(body);
  const payment = String(body.payment ?? "Prepaid");
  if (!["COD", "Prepaid"].includes(payment)) {
    throw new AppError(400, "payment must be COD or Prepaid");
  }

  if (isDraft) {
    const customer = String(body.customer ?? "").trim();
    if (!customer) throw new AppError(400, "Customer name is required to save a draft");
    let amount = Number(body.amount ?? body.invoiceValue ?? body.codAmount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    const goodItems = lineItems.filter((row) => String((row as Record<string, unknown>).name ?? "").trim());
    if (goodItems.length > 0) {
      validateOrderItems(goodItems);
      const sum = sumItemsAmount(goodItems);
      if (amount === 0) amount = sum;
    }
    const shippingAddress1 = String(body.shippingAddress1 ?? body.addressLine1 ?? body.address ?? "");
    const shippingCity = String(body.shippingCity ?? body.city ?? "");
    const shippingState = String(body.shippingState ?? body.state ?? "");
    const pin = String(body.shippingPincode ?? body.pincode ?? "").replace(/\D/g, "").slice(0, 6);
    const doc = await Order.create({
      orderId,
      customer,
      phone: String(body.phone ?? ""),
      address: shippingAddress1,
      city: shippingCity,
      state: shippingState,
      pincode: pin,
      weight: String(body.weight ?? "0.5").replace(/[^\d.]/g, "") || "0.5",
      courier: String(body.courier ?? "Delhivery"),
      payment,
      status: "draft",
      date: String(body.date ?? new Date().toISOString().slice(0, 10)),
      awb: "",
      amount,
      products: goodItems.length ? goodItems : lineItems,
      items: goodItems.length ? goodItems : lineItems,
      orderItems: goodItems.length ? goodItems : lineItems,
      pickupAddress: pickupSnapshot ?? (body.pickupAddress as string | undefined),
      pickupAddressId,
      pickupWarehouseId: pickupAddressId ? String(pickupAddressId) : undefined,
      createdBy: req.user._id,
      ownerUserId: req.user._id,
      dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
      vendorId: vendor?._id,
      channel: String(body.channel ?? "Manual"),
      sourceType: String(body.sourceType ?? "Manual"),
      customerEmail: String(body.customerEmail ?? body.email ?? ""),
      customerPhone: String(body.customerPhone ?? body.phone ?? ""),
      shippingAddress1,
      shippingAddress2: String(body.shippingAddress2 ?? body.addressLine2 ?? ""),
      shippingPincode: pin,
      shippingCity,
      shippingState,
      velocityWarehouseId: snapshotVelocityWh,
      courierCompanyId: carrierPref,
    });
    appendStatusHistory(doc, "draft", req.user._id);
    await doc.save();
    res.status(201).json(mapOrder(doc));
    return;
  }

  validateOrderItems(lineItems);

  const shippingAddress1 = String(body.shippingAddress1 ?? body.addressLine1 ?? body.address ?? "");
  const shippingAddress2 = String(body.shippingAddress2 ?? body.addressLine2 ?? "");
  const shippingCity = String(body.shippingCity ?? body.city ?? "");
  const shippingState = String(body.shippingState ?? body.state ?? "");
  const shippingPincode = String(body.shippingPincode ?? body.pincode ?? "");
  const shippingPincodeDigits = shippingPincode.replace(/\D/g, "").slice(0, 6);
  const rawLength = Number(body.length ?? 0);
  const rawWidth = Number(body.width ?? body.breadth ?? 0);
  const rawHeight = Number(body.height ?? 0);

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

  let amount = Number(body.amount ?? body.codAmount ?? body.invoiceValue ?? 0);
  const computed = sumItemsAmount(lineItems);
  if (!Number.isFinite(amount) || amount < 0) amount = computed;
  if (payment === "COD" && amount === 0 && computed > 0) amount = computed;
  if (amount < 0) throw new AppError(400, "Order amount cannot be negative");

  let statusStored = normalizeOrderStatus(String(body.status ?? "ready_to_ship"));
  if (statusStored === "draft") statusStored = "ready_to_ship";

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
    status: statusStored,
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    awb: String(body.awb ?? "").trim(),
    amount,
    products: lineItems,
    items: lineItems,
    orderItems: lineItems,
    dimensions: body.dimensions as string | undefined,
    zone: body.zone as string | undefined,
    pickupAddress: pickupSnapshot ?? (body.pickupAddress as string | undefined),
    pickupAddressId,
    pickupWarehouseId: pickupAddressId ? String(pickupAddressId) : undefined,
    createdBy: req.user._id,
    ownerUserId: req.user._id,
    dropshipperId: req.user.role === "dropshipper" ? req.user._id : undefined,
    vendorId: vendor?._id,
    channel: String(body.channel ?? "Manual"),
    sourceType: String(body.sourceType ?? "Manual"),
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
  appendStatusHistory(doc, String(doc.status), req.user._id, "created");
  await doc.save();
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
  await assertOrderAccess(req.user, order);

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

  const rawPickupUpdate = body.pickupAddressId ?? body.pickupWarehouseId;
  if (rawPickupUpdate !== undefined) {
    const s = String(rawPickupUpdate ?? "").trim();
    if (s === "") {
      const st = String(order.status ?? "").toLowerCase();
      if (st !== "draft") {
        throw new AppError(400, "pickupAddressId cannot be cleared except on draft orders");
      }
      order.pickupAddressId = undefined;
      order.pickupWarehouseId = undefined;
      order.pickupAddress = undefined;
      order.velocityWarehouseId = undefined;
    } else {
      if (!mongoose.isValidObjectId(s)) throw new AppError(400, "Invalid pickupAddressId");
      const p = await Pickup.findOne(pickupByIdSelectableQuery(s, req.user));
      if (!p) throw new AppError(400, "Pickup address not found or not allowed");
      const pu = await Pickup.findById(p._id)
        .select(
          "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId"
        )
        .lean();
      if (!pu) throw new AppError(400, "Pickup address not found");
      const built = buildPickupSnapshotFromLean(pu, p._id);
      order.pickupAddressId = p._id;
      order.pickupWarehouseId = String(p._id);
      order.pickupAddress = built.snapshot;
      order.velocityWarehouseId = built.velocityWarehouseId;
    }
  }

  await order.save();
  res.json(mapOrder(order));
});

export const createShipment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
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
  if (order.shipmentCreated) throw new AppError(400, "Shipment already created for this order");
  if (order.isJunk) throw new AppError(400, "Cannot create shipment for junk order");

  const courier = await Courier.findById(courierId).lean();
  if (!courier) throw new AppError(404, "Courier not found");
  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) throw new AppError(404, "Warehouse not found");
  if (warehouse.isActive === false) throw new AppError(400, "Warehouse is inactive");

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
  "in_transit",
  "out-for-delivery",
  "out_for_delivery",
  "delivered",
  "pending-pickup",
  "pending_pickup",
  "pickup_scheduled",
  "picked_up",
  "ready-to-ship",
  "ready_to_ship",
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
    await assertOrderAccess(req.user, order);

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
        status: "ready_to_ship",
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
  await assertOrderAccess(req.user, order);

  order.isJunk = true;
  order.junkedAt = new Date();
  order.junkReason = junkReason?.trim() || order.junkReason;
  order.status = "junk";
  appendStatusHistory(order, "junk", req.user._id, junkReason?.trim());
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
  await assertOrderAccess(req.user, o);

  if (req.user.role === "dropshipper") {
    const next = String(status).toLowerCase().replace(/-/g, "_");
    if (next !== "ready_to_ship") {
      throw new AppError(403, "Forbidden");
    }
    const st = String(o.status || "").toLowerCase().replace(/-/g, "_");
    if (BLOCKED_BULK_MOVE_TO_READY.has(st)) {
      throw new AppError(400, `Order cannot be moved to Ready to Ship from status "${o.status}"`);
    }
    if (o.isJunk) throw new AppError(400, "Cannot move junk orders to Ready to Ship");
    if (o.shipmentCreated) throw new AppError(400, "Cannot move orders that already have a shipment");

    o.status = "ready_to_ship";
    o.shipmentStatus = "ready_to_ship";
    o.movedToReadyAt = new Date();
    appendStatusHistory(o, "ready_to_ship", req.user._id);
  } else {
    const nextNorm = normalizeOrderStatus(status);
    const check = isValidStatusTransition(o.status, nextNorm, {
      role: req.user.role,
      isAdmin: req.user.role === "admin",
    });
    if (!check.ok) throw new AppError(400, check.message ?? "Invalid status transition");
    appendStatusHistory(o, nextNorm, req.user._id);
    o.status = nextNorm;
    if (nextNorm === "ready_to_ship") {
      o.shipmentStatus = "ready_to_ship";
      o.movedToReadyAt = new Date();
    }
  }
  await o.save();
  res.json(mapOrder(o));
});

function generateAwb() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AWB-${Date.now()}-${suffix}`;
}

/**
 * Admin-only: Assign shipment processing details to orders already in Ready-to-Ship.
 * Moves them to Pending Pickup and generates an AWB.
 */
export const processSelectedOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const body = req.body as {
    orderIds?: unknown;
    pickupAddressId?: unknown;
    courierName?: unknown;
    shipmentMode?: unknown;
    weight?: unknown;
    length?: unknown;
    width?: unknown;
    height?: unknown;
  };

  const orderIds = body.orderIds;
  if (!Array.isArray(orderIds) || orderIds.length === 0) throw new AppError(400, "orderIds must be a non-empty array");
  const ids = [...new Set(orderIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError(400, "orderIds must not be empty");

  const pickupAddressId = String(body.pickupAddressId ?? "").trim();
  if (!pickupAddressId) throw new AppError(400, "pickupAddressId is required");
  if (!mongoose.isValidObjectId(pickupAddressId)) throw new AppError(400, "Invalid pickupAddressId");

  const courierName = String(body.courierName ?? "").trim();
  if (!courierName) throw new AppError(400, "courierName is required");

  const shipmentMode = String(body.shipmentMode ?? "forward").toLowerCase();
  if (!["forward", "reverse"].includes(shipmentMode)) throw new AppError(400, "shipmentMode must be forward or reverse");

  const weight = body.weight != null && String(body.weight).trim() !== "" ? Number(body.weight) : undefined;
  if (weight !== undefined && (!(weight > 0) || !Number.isFinite(weight))) throw new AppError(400, "weight must be > 0");

  const length = body.length != null && String(body.length).trim() !== "" ? Number(body.length) : undefined;
  const width = body.width != null && String(body.width).trim() !== "" ? Number(body.width) : undefined;
  const height = body.height != null && String(body.height).trim() !== "" ? Number(body.height) : undefined;
  for (const [k, v] of [
    ["length", length],
    ["width", width],
    ["height", height],
  ] as const) {
    if (v !== undefined && (!(v > 0) || !Number.isFinite(v))) throw new AppError(400, `${k} must be > 0`);
  }

  const pickup = await Pickup.findOne(pickupByIdSelectableQuery(pickupAddressId, req.user))
    .select(
      "label contactName phone alternatePhone email addressLine1 addressLine2 landmark city state pincode country gstin velocityWarehouseId"
    )
    .lean();
  if (!pickup) throw new AppError(404, "Pickup address not found");

  const pickupSnapshot = buildPickupSnapshotFromLean(
    pickup,
    new mongoose.Types.ObjectId(pickupAddressId)
  ).snapshot;

  const orders = await Order.find({ orderId: { $in: ids } }).exec();
  if (orders.length !== ids.length) throw new AppError(404, "One or more orders were not found");

  // Validate state transitions and assign per-order AWB
  const now = new Date();
  const updated = [];
  for (const o of orders) {
    const st = String(o.status || "").toLowerCase();
    if (o.isJunk) throw new AppError(400, `Order ${o.orderId} is junk`);
    if (o.shipmentCreated) throw new AppError(400, `Order ${o.orderId} already has a shipment`);
    if (st !== "ready-to-ship" && st !== "ready_to_ship" && st !== "ready-to-ship".toLowerCase()) {
      throw new AppError(400, `Order ${o.orderId} must be in Ready to Ship`);
    }
    if (String(o.awb || "").trim()) {
      throw new AppError(400, `Order ${o.orderId} already has an AWB`);
    }

    const awb = generateAwb();
    o.awb = awb;
    o.courierName = courierName;
    o.courier = courierName;
    o.pickupAddressId = new mongoose.Types.ObjectId(pickupAddressId);
    o.pickupWarehouseId = pickupAddressId;
    o.pickupAddress = pickupSnapshot;
    o.velocityWarehouseId = pickupSnapshot.velocityWarehouseId;
    if (weight !== undefined) o.weight = String(weight);
    if (length !== undefined) o.length = length;
    if (width !== undefined) {
      o.width = width;
      o.breadth = width;
    }
    if (height !== undefined) o.height = height;
    if (o.length && (o.width ?? o.breadth) && o.height) {
      const w = o.width ?? o.breadth;
      o.dimensions = `${o.length}x${w}x${o.height} cm`;
    }
    o.assignedDateTime = now;
    o.status = "pending-pickup";
    o.shipmentStatus = "pending_pickup";
    (o as unknown as { shipmentMode?: string }).shipmentMode = shipmentMode;
    await o.save();
    updated.push({ orderId: o.orderId, awb });
  }

  res.json({ success: true, updatedCount: updated.length, updated });
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
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { orderId } = req.params;
  const o = await Order.findOne({ orderId });
  if (!o) throw new AppError(404, "Order not found");
  await assertOrderAccess(req.user, o);
  res.json(mapOrder(o));
});
