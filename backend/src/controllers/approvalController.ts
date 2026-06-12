import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { ShippingRateApproval } from "../models/ShippingRateApproval.js";
import { ProductPriceApproval } from "../models/ProductPriceApproval.js";
import {
  ShippingRateCard,
  DEFAULT_ZONES,
  DEFAULT_WEIGHTS,
  defaultRateMatrix,
} from "../models/ShippingRateCard.js";
import { Courier } from "../models/Courier.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { DropshipperShippingOverride } from "../models/DropshipperShippingOverride.js";
import { createInAppNotification, notifyAllAdmins } from "../services/inAppNotifications.js";
import mongoose from "mongoose";
import { assertOwnerAdmin, isStaffAdmin } from "../utils/staffPermissions.js";

function assertAdmin(req: AuthRequest): void {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
}

function assertOwnerAdminReq(req: AuthRequest): void {
  assertAdmin(req);
  assertOwnerAdmin(req.user!);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapShippingApproval(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    type: row.type,
    courierName: row.courierName,
    dropshipperUserId: row.dropshipperUserId ? String(row.dropshipperUserId) : null,
    previousValues: row.previousValues ?? {},
    pendingValues: row.pendingValues ?? {},
    status: row.status,
    submittedBy: row.submittedBy ? String(row.submittedBy) : null,
    submittedByRole: row.submittedByRole,
    submittedByName: row.submittedByName,
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
    rejectedReason: row.rejectedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPriceApproval(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    productId: String(row.productId),
    productName: row.productName,
    productSku: row.productSku,
    previousPrice: row.previousPrice,
    previousSellingPrice: row.previousSellingPrice,
    previousShippingCharge: row.previousShippingCharge,
    pendingPrice: row.pendingPrice,
    pendingSellingPrice: row.pendingSellingPrice,
    pendingShippingCharge: row.pendingShippingCharge,
    status: row.status,
    reason: row.reason,
    submittedBy: row.submittedBy ? String(row.submittedBy) : null,
    submittedByRole: row.submittedByRole,
    submittedByName: row.submittedByName,
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
    rejectedReason: row.rejectedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function applyShippingApproval(doc: InstanceType<typeof ShippingRateApproval>): Promise<void> {
  if (doc.type === "courier") {
    const name = String(doc.courierName ?? doc.pendingValues?.name ?? "").trim();
    if (!name) throw new AppError(400, "Courier name required");
    await Courier.findOneAndUpdate({ name }, doc.pendingValues, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    return;
  }
  if (doc.type === "rate_card") {
    const paymentType = (doc.pendingValues.paymentType as "COD" | "Prepaid") ?? "Prepaid";
    await ShippingRateCard.findOneAndUpdate(
      { paymentType },
      {
        paymentType,
        zones: doc.pendingValues.zones ?? DEFAULT_ZONES,
        weights: doc.pendingValues.weights ?? DEFAULT_WEIGHTS,
        rates: doc.pendingValues.rates ?? defaultRateMatrix(),
        updatedBy: doc.reviewedBy,
      },
      { upsert: true, new: true }
    );
    return;
  }
  if (doc.type === "dropshipper_override") {
    const dsId = doc.dropshipperUserId;
    if (!dsId) throw new AppError(400, "Dropshipper required");
    await DropshipperShippingOverride.findOneAndUpdate(
      { dropshipperUserId: dsId },
      {
        dropshipperUserId: dsId,
        shippingCharge: num(doc.pendingValues.shippingCharge),
        surfaceRate: doc.pendingValues.surfaceRate != null ? num(doc.pendingValues.surfaceRate) : undefined,
        airRate: doc.pendingValues.airRate != null ? num(doc.pendingValues.airRate) : undefined,
        courierRates: Array.isArray(doc.pendingValues.courierRates) ? doc.pendingValues.courierRates : [],
        notes: String(doc.pendingValues.notes ?? ""),
        updatedBy: doc.reviewedBy,
      },
      { upsert: true, new: true }
    );
  }
}

async function applyProductPriceApproval(doc: InstanceType<typeof ProductPriceApproval>): Promise<void> {
  const p = await Product.findById(doc.productId);
  if (!p) throw new AppError(404, "Product not found");
  p.price = doc.pendingPrice;
  p.sellingPrice = doc.pendingSellingPrice;
  p.shippingCharge = doc.pendingShippingCharge;
  await p.save();
}

/** GET live rate card (read-only for DS/vendor, editable by admin). */
export const getShippingRateCard = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin" && isStaffAdmin(req.user)) {
    assertOwnerAdmin(req.user);
  }
  const paymentType = (String(req.query.paymentType ?? "Prepaid") === "COD" ? "COD" : "Prepaid") as
    | "COD"
    | "Prepaid";
  const card = await ShippingRateCard.findOne({ paymentType }).lean();
  const payload = card ?? {
    paymentType,
    zones: DEFAULT_ZONES,
    weights: DEFAULT_WEIGHTS,
    rates: defaultRateMatrix(),
  };
  res.json({
    paymentType: payload.paymentType,
    zones: payload.zones,
    weights: payload.weights,
    rates: payload.rates,
    readOnly: req.user.role !== "admin",
  });
});

/** Admin: save rate card immediately (no approval). */
export const adminSaveShippingRateCard = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const paymentType = (req.body.paymentType === "COD" ? "COD" : "Prepaid") as "COD" | "Prepaid";
  const card = await ShippingRateCard.findOneAndUpdate(
    { paymentType },
    {
      paymentType,
      zones: req.body.zones ?? DEFAULT_ZONES,
      weights: req.body.weights ?? DEFAULT_WEIGHTS,
      rates: req.body.rates ?? defaultRateMatrix(),
      updatedBy: req.user!._id,
    },
    { upsert: true, new: true }
  );
  res.json(card);
});

/** Admin: upsert courier immediately. */
export const adminUpsertCourier = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const c = await Courier.findOneAndUpdate({ name: req.body.name }, req.body, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  res.json(c);
});

/** Non-admin: submit shipping rate change for approval. */
export const submitShippingRateChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin") throw new AppError(400, "Admins should use direct update endpoints");

  const type = String(req.body.type ?? "courier") as "courier" | "rate_card" | "dropshipper_override";
  const pendingValues = (req.body.pendingValues ?? req.body) as Record<string, unknown>;
  let previousValues: Record<string, unknown> = {};
  let courierName: string | undefined;
  let dropshipperUserId: mongoose.Types.ObjectId | undefined;

  if (type === "courier") {
    courierName = String(pendingValues.name ?? req.body.courierName ?? "").trim();
    if (!courierName) throw new AppError(400, "Courier name required");
    const existing = await Courier.findOne({ name: courierName }).lean();
    previousValues = existing
      ? { ...existing, _id: String(existing._id) }
      : { name: courierName, surfaceRate: 0, airRate: 0 };
  } else if (type === "rate_card") {
    const paymentType = pendingValues.paymentType === "COD" ? "COD" : "Prepaid";
    const existing = await ShippingRateCard.findOne({ paymentType }).lean();
    previousValues = existing
      ? { paymentType: existing.paymentType, zones: existing.zones, weights: existing.weights, rates: existing.rates }
      : { paymentType, zones: DEFAULT_ZONES, weights: DEFAULT_WEIGHTS, rates: defaultRateMatrix() };
  } else if (type === "dropshipper_override") {
    const dsId = String(req.body.dropshipperUserId ?? "").trim();
    if (!mongoose.isValidObjectId(dsId)) throw new AppError(400, "Valid dropshipperUserId required");
    dropshipperUserId = new mongoose.Types.ObjectId(dsId);
    previousValues = (req.body.previousValues as Record<string, unknown>) ?? {};
  }

  const doc = await ShippingRateApproval.create({
    type,
    courierName,
    dropshipperUserId,
    previousValues,
    pendingValues,
    status: "pending",
    submittedBy: req.user._id,
    submittedByRole: req.user.role,
    submittedByName: req.user.name,
  });

  const oldRate =
    type === "courier"
      ? num(previousValues.surfaceRate ?? previousValues.airRate)
      : type === "rate_card"
        ? num((previousValues.rates as number[][])?.[0]?.[0])
        : num(previousValues.shippingCharge);
  const newRate =
    type === "courier"
      ? num(pendingValues.surfaceRate ?? pendingValues.airRate)
      : type === "rate_card"
        ? num((pendingValues.rates as number[][])?.[0]?.[0])
        : num(pendingValues.shippingCharge);

  await notifyAllAdmins(
    "approval_pending",
    "Shipping rate change pending approval",
    `${req.user.name ?? req.user.role} requested ${type} update${courierName ? ` for ${courierName}` : ""}: ₹${oldRate} → ₹${newRate}`,
    { approvalId: String(doc._id), approvalKind: "shipping", type, courierName }
  );

  res.status(201).json(mapShippingApproval(doc.toObject() as unknown as Record<string, unknown>));
});

/** List shipping rate approvals (admin: all; others: own submissions). */
export const listShippingRateApprovals = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin" && isStaffAdmin(req.user)) assertOwnerAdmin(req.user);
  const status = String(req.query.status ?? "").trim();
  const q: Record<string, unknown> =
    req.user.role === "admin" ? {} : { submittedBy: req.user._id };
  if (status && status !== "all") q.status = status;

  const rows = await ShippingRateApproval.find(q).sort({ createdAt: -1 }).limit(200).lean();
  res.json(rows.map((r) => mapShippingApproval(r as Record<string, unknown>)));
});

export const approveShippingRateApproval = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const doc = await ShippingRateApproval.findById(req.params.id);
  if (!doc) throw new AppError(404, "Approval not found");
  if (doc.status !== "pending") throw new AppError(400, "Already reviewed");

  doc.status = "approved";
  doc.reviewedBy = req.user!._id;
  doc.reviewedAt = new Date();
  await doc.save();
  await applyShippingApproval(doc);

  await createInAppNotification(
    doc.submittedBy,
    "approval_decision",
    "Shipping rate change approved",
    `Your ${doc.type} rate change was approved by admin.`,
    { approvalId: String(doc._id), approvalKind: "shipping", decision: "approved" }
  );

  res.json(mapShippingApproval(doc.toObject() as unknown as Record<string, unknown>));
});

export const rejectShippingRateApproval = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const doc = await ShippingRateApproval.findById(req.params.id);
  if (!doc) throw new AppError(404, "Approval not found");
  if (doc.status !== "pending") throw new AppError(400, "Already reviewed");

  doc.status = "rejected";
  doc.reviewedBy = req.user!._id;
  doc.reviewedAt = new Date();
  doc.rejectedReason = String(req.body.reason ?? req.body.rejectedReason ?? "").trim() || "Rejected by admin";
  await doc.save();

  await createInAppNotification(
    doc.submittedBy,
    "approval_decision",
    "Shipping rate change rejected",
    doc.rejectedReason,
    { approvalId: String(doc._id), approvalKind: "shipping", decision: "rejected" }
  );

  res.json(mapShippingApproval(doc.toObject() as unknown as Record<string, unknown>));
});

/** List product price approvals. */
export const listProductPriceApprovals = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin" && isStaffAdmin(req.user)) assertOwnerAdmin(req.user);
  const status = String(req.query.status ?? "").trim();
  const q: Record<string, unknown> =
    req.user.role === "admin" ? {} : { submittedBy: req.user._id };
  if (status && status !== "all") q.status = status;

  const rows = await ProductPriceApproval.find(q).sort({ createdAt: -1 }).limit(200).lean();
  res.json(rows.map((r) => mapPriceApproval(r as Record<string, unknown>)));
});

export const approveProductPriceApproval = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const doc = await ProductPriceApproval.findById(req.params.id);
  if (!doc) throw new AppError(404, "Approval not found");
  if (doc.status !== "pending") throw new AppError(400, "Already reviewed");

  doc.status = "approved";
  doc.reviewedBy = req.user!._id;
  doc.reviewedAt = new Date();
  await doc.save();
  await applyProductPriceApproval(doc);

  await createInAppNotification(
    doc.submittedBy,
    "approval_decision",
    "Product price change approved",
    `${doc.productName}: ₹${doc.previousPrice} → ₹${doc.pendingPrice} (now live)`,
    { approvalId: String(doc._id), approvalKind: "price", decision: "approved", productId: String(doc.productId) }
  );

  res.json(mapPriceApproval(doc.toObject() as unknown as Record<string, unknown>));
});

export const rejectProductPriceApproval = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const doc = await ProductPriceApproval.findById(req.params.id);
  if (!doc) throw new AppError(404, "Approval not found");
  if (doc.status !== "pending") throw new AppError(400, "Already reviewed");

  doc.status = "rejected";
  doc.reviewedBy = req.user!._id;
  doc.reviewedAt = new Date();
  doc.rejectedReason = String(req.body.reason ?? req.body.rejectedReason ?? "").trim() || "Rejected by admin";
  await doc.save();

  await createInAppNotification(
    doc.submittedBy,
    "approval_decision",
    "Product price change rejected",
    `${doc.productName}: ${doc.rejectedReason}`,
    { approvalId: String(doc._id), approvalKind: "price", decision: "rejected", productId: String(doc.productId) }
  );

  res.json(mapPriceApproval(doc.toObject() as unknown as Record<string, unknown>));
});

/** Create product price approval from updateProduct intercept (internal export). */
export async function createProductPriceChangeRequest(
  req: AuthRequest,
  product: InstanceType<typeof Product>,
  pending: { price?: number; sellingPrice?: number; shippingCharge?: number },
  reason?: string
): Promise<InstanceType<typeof ProductPriceApproval>> {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const existingPending = await ProductPriceApproval.findOne({
    productId: product._id,
    status: "pending",
  });
  if (existingPending) {
    existingPending.pendingPrice = pending.price ?? existingPending.pendingPrice;
    existingPending.pendingSellingPrice = pending.sellingPrice ?? existingPending.pendingSellingPrice;
    existingPending.pendingShippingCharge = pending.shippingCharge ?? existingPending.pendingShippingCharge;
    if (reason) existingPending.reason = reason;
    await existingPending.save();
    return existingPending;
  }

  const doc = await ProductPriceApproval.create({
    productId: product._id,
    productName: product.name,
    productSku: product.sku,
    previousPrice: num(product.price),
    previousSellingPrice: num(product.sellingPrice),
    previousShippingCharge: num(product.shippingCharge),
    pendingPrice: pending.price ?? num(product.price),
    pendingSellingPrice: pending.sellingPrice ?? num(product.sellingPrice),
    pendingShippingCharge: pending.shippingCharge ?? num(product.shippingCharge),
    status: "pending",
    reason,
    submittedBy: req.user._id,
    submittedByRole: req.user.role,
    submittedByName: req.user.name,
  });

  const prevFinal = num(product.price) + num(product.shippingCharge);
  const nextFinal = doc.pendingPrice + doc.pendingShippingCharge;

  await notifyAllAdmins(
    "approval_pending",
    "Product price change pending approval",
    `${req.user.name ?? req.user.role} requested price update for ${product.name}: ₹${prevFinal} → ₹${nextFinal}`,
    {
      approvalId: String(doc._id),
      approvalKind: "price",
      productId: String(product._id),
      productName: product.name,
    }
  );

  return doc;
}

export const PRICE_FIELD_KEYS = [
  "price",
  "sellingPrice",
  "selling_price",
  "shippingCharge",
  "shipping_charge",
] as const;

export function extractPendingPriceFields(
  body: Record<string, unknown>,
  product: InstanceType<typeof Product>
): { pending: { price?: number; sellingPrice?: number; shippingCharge?: number }; hasChange: boolean } {
  const pending: { price?: number; sellingPrice?: number; shippingCharge?: number } = {};
  let hasChange = false;

  if (Object.prototype.hasOwnProperty.call(body, "price")) {
    const v = num(body.price);
    if (v !== num(product.price)) {
      pending.price = v;
      hasChange = true;
    }
  }
  const spRaw = body.sellingPrice ?? body.selling_price;
  if (spRaw !== undefined) {
    const v = num(spRaw);
    if (v !== num(product.sellingPrice)) {
      pending.sellingPrice = v;
      hasChange = true;
    }
  }
  const scRaw = body.shippingCharge ?? body.shipping_charge;
  if (scRaw !== undefined) {
    const v = num(scRaw);
    if (v !== num(product.shippingCharge)) {
      pending.shippingCharge = v;
      hasChange = true;
    }
  }

  return { pending, hasChange };
}

export function stripPriceFieldsFromBody(body: Record<string, unknown>): void {
  for (const k of PRICE_FIELD_KEYS) {
    delete body[k];
  }
}

function mapDropshipperShippingOverride(row: Record<string, unknown> | null) {
  if (!row) {
    return {
      dropshipperUserId: "",
      shippingCharge: 0,
      surfaceRate: undefined as number | undefined,
      airRate: undefined as number | undefined,
      courierRates: [] as Array<Record<string, unknown>>,
      notes: "",
      updatedAt: null as Date | null,
    };
  }
  return {
    dropshipperUserId: row.dropshipperUserId ? String(row.dropshipperUserId) : "",
    shippingCharge: num(row.shippingCharge),
    surfaceRate: row.surfaceRate != null ? num(row.surfaceRate) : undefined,
    airRate: row.airRate != null ? num(row.airRate) : undefined,
    courierRates: Array.isArray(row.courierRates) ? row.courierRates : [],
    notes: String(row.notes ?? ""),
    updatedAt: row.updatedAt as Date | null,
  };
}

/** Admin: read per-dropshipper courier pricing overrides. */
export const getDropshipperShippingRates = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const userId = req.params.userId;
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");
  const user = await User.findById(userId).select("name email role").lean();
  if (!user || user.role !== "dropshipper") throw new AppError(404, "Dropshipper not found");
  const override = await DropshipperShippingOverride.findOne({ dropshipperUserId: userId }).lean();
  const couriers = await Courier.find({ active: { $ne: false } }).sort({ priority: 1, name: 1 }).lean();
  res.json({
    dropshipper: { id: userId, name: user.name, email: user.email },
    override: mapDropshipperShippingOverride(override as Record<string, unknown> | null),
    availableCouriers: couriers.map((c) => ({
      name: c.name,
      surfaceRate: c.surfaceRate,
      airRate: c.airRate,
    })),
  });
});

/** Admin: save per-dropshipper courier pricing (affects live rate quotes). */
export const saveDropshipperShippingRates = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertOwnerAdminReq(req);
  const userId = req.params.userId;
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");
  const user = await User.findById(userId).select("role name").lean();
  if (!user || user.role !== "dropshipper") throw new AppError(404, "Dropshipper not found");

  const courierRates = Array.isArray(req.body.courierRates) ? req.body.courierRates : [];
  const doc = await DropshipperShippingOverride.findOneAndUpdate(
    { dropshipperUserId: userId },
    {
      dropshipperUserId: userId,
      shippingCharge: num(req.body.shippingCharge),
      surfaceRate: req.body.surfaceRate != null ? num(req.body.surfaceRate) : undefined,
      airRate: req.body.airRate != null ? num(req.body.airRate) : undefined,
      courierRates: courierRates.map((r: Record<string, unknown>) => ({
        courierName: String(r.courierName ?? "").trim(),
        carrierId: r.carrierId != null ? String(r.carrierId) : undefined,
        surfaceRate: r.surfaceRate != null ? num(r.surfaceRate) : undefined,
        airRate: r.airRate != null ? num(r.airRate) : undefined,
        codRate: r.codRate != null ? num(r.codRate) : undefined,
        enabled: r.enabled !== false,
      })),
      notes: String(req.body.notes ?? ""),
      updatedBy: req.user!._id,
    },
    { upsert: true, new: true }
  );

  await ShippingRateApproval.create({
    type: "dropshipper_override",
    dropshipperUserId: new mongoose.Types.ObjectId(userId),
    pendingValues: {
      shippingCharge: doc.shippingCharge,
      surfaceRate: doc.surfaceRate,
      airRate: doc.airRate,
      courierRates: doc.courierRates,
      notes: doc.notes,
    },
    previousValues: {},
    status: "approved",
    submittedBy: req.user!._id,
    submittedByRole: "admin",
    submittedByName: req.user!.name,
    reviewedBy: req.user!._id,
    reviewedAt: new Date(),
  });

  res.json(mapDropshipperShippingOverride(doc.toObject() as unknown as Record<string, unknown>));
});
