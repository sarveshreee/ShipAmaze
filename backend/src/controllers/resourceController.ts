import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { User, type UserRole } from "../models/User.js";
import {
  clearDefaultPickupsForOwnerDoc,
  pickupListQuery,
  pickupOwnerScope,
  PICKUP_ACTIVE,
  PICKUP_NOT_DELETED,
} from "../utils/pickupQuery.js";
import {
  trimStr,
  normalizePincodeIndia,
  validateIndianPincode,
  normalizePhoneInput,
  validateIndianPhone,
  validateGstinOptional,
  validateEmailOptional,
  pickupAddressFingerprint,
  assertIndianPhonesDistinct,
} from "../utils/pickupValidation.js";
import { Warehouse } from "../models/Warehouse.js";
import { Courier } from "../models/Courier.js";
import { PincodeServiceability } from "../models/PincodeServiceability.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { Invoice } from "../models/Invoice.js";
import { NDR } from "../models/NDR.js";
import { ReturnOrder } from "../models/ReturnOrder.js";
import { WeightDispute } from "../models/WeightDispute.js";
import { Manifest } from "../models/Manifest.js";
import { Pickup } from "../models/Pickup.js";
import { CodRemittance } from "../models/CodRemittance.js";
import { Product } from "../models/Product.js";
import { ProductRequest } from "../models/ProductRequest.js";
import { TabPermission } from "../models/TabPermission.js";
import mongoose, { type Types } from "mongoose";
import { randomBytes } from "crypto";
import { creditWallet } from "../services/walletLedger.js";

function transactionDisplayType(ledgerType: string | undefined, type: "Credit" | "Debit"): string {
  const lt = (ledgerType || "general").toLowerCase();
  if (lt === "manual_credit_request" || lt === "recharge" || lt === "manual_test_recharge") return "Recharge";
  if (lt === "admin_adjustment_credit" || lt === "admin_adjustment_debit") return "Adjustment";
  if (lt === "cod" || lt === "cod_settlement") return "COD";
  if (lt === "deduction" || lt === "shipping" || lt === "fee" || lt === "admin_manual_debit") return "Deduction";
  if (type === "Debit") return "Debit";
  return "Credit";
}

export const listVendors = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const rows = await Vendor.find().populate("userId").lean();
  res.json(
    rows.map((v) => ({
      id: String(v._id),
      name: v.name,
      city: v.city,
      pin: v.pin,
      assignedVendors: v.assignedVendors,
      ordersToday: v.ordersToday,
      status: v.status,
      contactPerson: v.contactPerson,
      phone: v.phone,
      email: v.email,
    }))
  );
});

export const listDropshippers = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const rows = await Dropshipper.find().populate("userId").lean();
  const out = [];
  for (const d of rows) {
    const u = d.userId as { name?: string; email?: string; phone?: string } | null;
    out.push({
      id: String(d._id),
      name: u?.name ?? "User",
      email: u?.email ?? "",
      phone: u?.phone ?? "",
      totalOrders: d.totalOrders,
      activeOrders: d.activeOrders,
      wallet: 0,
      status: "Active",
      kycVerified: d.kycVerified,
      joinDate: d.joinDate ? new Date(d.joinDate).toISOString().slice(0, 10) : "",
    });
  }
  res.json(out);
});

export const listUsersByRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const role = String(req.query.role ?? "");
  if (role !== "vendor" && role !== "dropshipper") throw new AppError(400, "Invalid role");
  const users = await User.find({ role }).lean();
  res.json(
    users.map((u) => ({
      user_id: String(u._id),
      full_name: u.name,
      business_name: u.companyName,
      role: u.role,
    }))
  );
});

export const listWarehouses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (req.user.role === "vendor" && vendor) {
    const rows = await Warehouse.find({
      vendorId: vendor._id,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    }).lean();
    res.json(rows);
    return;
  }
  if (req.user.role === "admin") {
    res.json(await Warehouse.find().lean());
    return;
  }
  res.json([]);
});

export const createWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor) throw new AppError(400, "Vendor profile not found");
  const w = await Warehouse.create({ ...req.body, vendorId: vendor._id });
  res.status(201).json(w);
});

export const updateWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor) throw new AppError(403, "Forbidden");
  const w = await Warehouse.findOneAndUpdate(
    { _id: req.params.id, vendorId: vendor._id },
    req.body,
    { new: true }
  );
  if (!w) throw new AppError(404, "Not found");
  res.json(w);
});

export const deleteWarehouse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor) throw new AppError(403, "Forbidden");
  const w = await Warehouse.findOneAndUpdate(
    { _id: req.params.id, vendorId: vendor._id },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!w) throw new AppError(404, "Not found");
  res.json({ ok: true, message: "Warehouse deactivated" });
});

export const listCouriers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await Courier.find().sort({ priority: 1 }).lean();
  res.json(
    rows.map((c) => ({
      name: c.name,
      active: c.active,
      priority: c.priority,
      deliveryRate: c.deliveryRate,
      ndrRate: c.ndrRate,
      rtoRate: c.rtoRate,
      avgDeliveryDays: c.avgDeliveryDays,
      codSupport: c.codSupport,
      reversePickup: c.reversePickup,
      surfaceRate: c.surfaceRate,
      airRate: c.airRate,
    }))
  );
});

export const upsertCourier = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const c = await Courier.findOneAndUpdate({ name: req.body.name }, req.body, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  res.json(c);
});

export const listPincodes = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await PincodeServiceability.find().lean();
  res.json(rows);
});

export const upsertPincode = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const p = await PincodeServiceability.findOneAndUpdate(
    { pincode: req.body.pincode },
    req.body,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(p);
});

export const getWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");

  let uid = req.user._id;
  if (req.user.role === "admin") {
    const q = String((req.query as { userId?: string }).userId ?? "").trim();
    if (q) {
      if (!mongoose.isValidObjectId(q)) throw new AppError(400, "Invalid userId");
      uid = new mongoose.Types.ObjectId(q);
    }
  }

  let w = await Wallet.findOne({ userId: uid });
  if (!w) {
    w = await Wallet.create({ userId: uid, balance: 0, currency: "INR" });
  }

  const completedMatch = {
    $or: [{ status: "completed" }, { status: { $exists: false } }, { status: null }],
  };

  const [pendingCodAgg, creditsAgg, debitsAgg] = await Promise.all([
    CodRemittance.aggregate<{ total?: number }>([
      {
        $match: {
          userId: uid,
          status: { $in: ["Pending", "Processing"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$codAmount" } } },
    ]),
    Transaction.aggregate<{ total?: number }>([
      {
        $match: {
          $and: [{ userId: uid }, completedMatch, { type: "Credit" }],
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate<{ total?: number }>([
      {
        $match: {
          $and: [{ userId: uid }, completedMatch, { type: "Debit" }],
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const pendingCod = pendingCodAgg[0]?.total ?? 0;
  const totalCredits = creditsAgg[0]?.total ?? 0;
  const totalDebits = debitsAgg[0]?.total ?? 0;
  const lastSyncedAt = (w.updatedAt ?? w.createdAt ?? new Date()).toISOString();

  res.json({
    success: true,
    data: {
      balance: Math.max(0, w.balance ?? 0),
      pendingCod,
      totalCredits,
      totalDebits,
      /** @deprecated use totalCredits — kept for older clients */
      totalRecharge: totalCredits,
      /** @deprecated use totalDebits */
      totalDeductions: totalDebits,
      lastSyncedAt,
      currency: w.currency ?? "INR",
    },
  });
});

/** Manual / test recharge — credits wallet immediately (no payment gateway). */
export const addWalletBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "vendor" && req.user.role !== "dropshipper") {
    throw new AppError(403, "Wallet recharge is only available for vendor and dropshipper accounts");
  }

  const body = req.body as { amount?: unknown; mode?: unknown };
  const mode = String(body.mode ?? "manual_test").toLowerCase();
  if (mode !== "manual_test" && mode !== "manual") {
    throw new AppError(
      400,
      "Only manual_test mode is supported until a payment gateway is integrated. Pass mode: \"manual_test\"."
    );
  }

  const raw = body.amount;
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new AppError(400, "Amount must be at least ₹1");
  }
  if (amount > 1_000_000) {
    throw new AppError(400, "Amount exceeds maximum allowed per request");
  }

  const refId = `manual:${Date.now()}-${randomBytes(4).toString("hex")}`;
  const r = await creditWallet({
    userId: req.user._id,
    amount,
    description: `Manual / test wallet recharge — ₹${amount}`,
    ledgerType: "manual_test_recharge",
    referenceType: "manual_test",
    referenceId: refId,
    reason: "Manual or test recharge (no payment gateway)",
  });

  const { createInAppNotification } = await import("../services/inAppNotifications.js");
  await createInAppNotification(
    req.user._id,
    "wallet_recharge",
    "Wallet recharged",
    `₹${amount} added to your wallet (manual / test).`,
    { txnId: r.txnId, amount }
  );

  res.status(201).json({
    success: true,
    message: "Balance added successfully (manual / test recharge).",
    data: {
      balanceAfter: r.balanceAfter,
      txnId: r.txnId,
      mode: "manual_test",
    },
  });
});

/** @deprecated Prefer POST /wallet/add-balance — same behavior (immediate manual test credit). */
export const addFunds = addWalletBalance;

export const listTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const q = req.query as Record<string, unknown>;
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? "50"), 10) || 50));
  const skip = (page - 1) * pageSize;

  const filter: Record<string, unknown> = { userId: req.user._id };
  const type = String(q.type ?? "").trim();
  if (type === "Credit" || type === "Debit") filter.type = type;
  const status = String(q.status ?? "").trim();
  if (status === "completed" || status === "pending" || status === "failed") filter.status = status;

  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: rows.map((t) => {
      const ledgerType = (t as { ledgerType?: string }).ledgerType ?? "general";
      const st = (t as { status?: string }).status ?? "completed";
      const createdAt = (t as { createdAt?: Date }).createdAt;
      const date = t.date || (createdAt ? new Date(createdAt).toISOString().slice(0, 10) : "");
      return {
        id: t.txnId,
        date,
        description: t.description,
        txnId: t.txnId,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        balanceBefore: (t as { balanceBefore?: number }).balanceBefore,
        status: st,
        ledgerType,
        referenceType: (t as { referenceType?: string }).referenceType,
        referenceId: (t as { referenceId?: string }).referenceId,
        reason: (t as { reason?: string }).reason,
        displayType: transactionDisplayType(ledgerType, t.type as "Credit" | "Debit"),
        createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
      };
    }),
    page,
    pageSize,
    total,
  });
});

export const listCodRemittances = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const raw = req.query as Record<string, unknown>;
  const page = Math.max(1, parseInt(String(raw.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(raw.pageSize ?? "50"), 10) || 50));
  const skip = (page - 1) * pageSize;

  const q: Record<string, unknown> = req.user.role === "admin" ? {} : { userId: req.user._id };
  const status = String(raw.status ?? "").trim();
  if (status) q.status = status;

  const [rows, total] = await Promise.all([
    CodRemittance.find(q).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    CodRemittance.countDocuments(q),
  ]);

  res.json({
    items: rows.map((c) => ({
      id: c.remittanceId,
      dropshipper: c.dropshipper,
      ordersCount: c.ordersCount,
      codAmount: c.codAmount,
      deductions: c.deductions,
      netPayable: c.netPayable,
      status: c.status,
      settleDate: c.settleDate,
      utr: c.utr,
    })),
    total,
    page,
    pageSize,
  });
});

export const listInvoices = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const raw = req.query as Record<string, unknown>;
  const page = Math.max(1, parseInt(String(raw.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(raw.pageSize ?? "50"), 10) || 50));
  const skip = (page - 1) * pageSize;

  const q: Record<string, unknown> = req.user.role === "admin" ? {} : { userId: req.user._id };
  const status = String(raw.status ?? "").trim();
  if (status) q.status = status;
  const dateFrom = String(raw.dateFrom ?? "").trim();
  const dateTo = String(raw.dateTo ?? "").trim();
  if (dateFrom || dateTo) {
    const range: Record<string, Date> = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) range.$gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        range.$lte = d;
      }
    }
    if (Object.keys(range).length) q.createdAt = range;
  }

  const [rows, total] = await Promise.all([
    Invoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Invoice.countDocuments(q),
  ]);

  res.json({
    items: rows.map((inv) => ({
      id: inv.invoiceId,
      date: inv.date,
      period: inv.period,
      orders: inv.ordersCount,
      shippingCharges: inv.shippingCharges,
      codCharges: inv.codCharges,
      gst: inv.gst,
      total: inv.total,
      status: inv.status,
      downloadUrl: inv.downloadUrl,
    })),
    total,
    page,
    pageSize,
  });
});

export const listNdr = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await NDR.find().sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((n) => ({
      awb: n.awb,
      customer: n.customer,
      seller: n.seller,
      reason: n.reason,
      attempts: n.attempts,
      lastUpdate: n.lastUpdate,
      status: n.status,
      phone: n.phone,
      nextAction: n.nextAction,
    }))
  );
});

export const updateNdr = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { awb } = req.params;
  const n = await NDR.findOneAndUpdate({ awb }, { $set: req.body }, { new: true });
  if (!n) throw new AppError(404, "NDR not found");
  res.json(n);
});

export const listReturns = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await ReturnOrder.find().sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((r) => ({
      id: r.returnId,
      originalOrderId: r.originalOrderId,
      awb: r.awb,
      customer: r.customer,
      reason: r.reason,
      courier: r.courier,
      status: r.status,
      date: r.date,
      refundAmount: r.refundAmount,
      weight: r.weight,
    }))
  );
});

export const updateReturn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { returnId } = req.params;
  const r = await ReturnOrder.findOneAndUpdate({ returnId }, { $set: req.body }, { new: true });
  if (!r) throw new AppError(404, "Return not found");
  res.json(r);
});

export const listManifests = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await Manifest.find().sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((m) => ({
      id: m.manifestId,
      date: m.date,
      courier: m.courier,
      ordersCount: m.ordersCount,
      totalWeight: m.totalWeight,
      pickupAddress: m.pickupAddress,
      status: m.status,
      pickupTime: m.pickupTime,
    }))
  );
});

function assertPickupApiRole(role: UserRole) {
  if (role !== "admin" && role !== "vendor" && role !== "dropshipper") {
    throw new AppError(403, "Pickup addresses are not available for this account");
  }
}

function pickupLabelFromBody(b: Record<string, unknown>): string {
  return trimStr(b.label) || trimStr(b.pickupName) || trimStr(b.warehouseName);
}

function pickupContactFromBody(b: Record<string, unknown>): string {
  return trimStr(b.contactName) || trimStr(b.contactPerson);
}

function mapPickupDoc(a: {
  _id: unknown;
  label: string;
  contactName?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  gstin?: string;
  isDefault?: boolean;
  isActive?: boolean;
  deletedAt?: Date;
  velocityWarehouseId?: string;
}) {
  const label = a.label ?? "";
  return {
    id: String(a._id),
    label,
    warehouseName: label,
    pickupName: label,
    contactName: a.contactName ?? "",
    contactPerson: a.contactName ?? "",
    phone: a.phone ?? "",
    alternatePhone: typeof a.alternatePhone === "string" && a.alternatePhone.trim() ? a.alternatePhone.trim() : undefined,
    email: typeof a.email === "string" && a.email.trim() ? a.email.trim() : undefined,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? "",
    landmark: typeof a.landmark === "string" && a.landmark.trim() ? a.landmark.trim() : undefined,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country ?? "India",
    gstin: typeof a.gstin === "string" && a.gstin.trim() ? a.gstin.trim().toUpperCase() : undefined,
    isDefault: Boolean(a.isDefault),
    isActive: a.isActive !== false,
    velocityWarehouseId:
      typeof a.velocityWarehouseId === "string" && a.velocityWarehouseId.trim()
        ? a.velocityWarehouseId.trim()
        : undefined,
  };
}

export const listPickupAddresses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  assertPickupApiRole(req.user.role);
  const rows = await Pickup.find(pickupListQuery(req.user, { includeInactive: true }))
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    success: true,
    data: rows.map((r) => mapPickupDoc(r as Parameters<typeof mapPickupDoc>[0])),
  });
});

/** @deprecated Use GET /pickup-addresses — kept for older clients */
export const listPickups = listPickupAddresses;

export const createPickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  assertPickupApiRole(req.user.role);

  const b = req.body as Record<string, unknown>;

  let ownerUserId: Types.ObjectId;
  let ownerRole: UserRole;

  if (req.user.role === "admin") {
    const rawOwner = trimStr(b.userId);
    if (!rawOwner || !mongoose.isValidObjectId(rawOwner)) {
      throw new AppError(400, "userId is required when creating a pickup as admin");
    }
    const owner = await User.findById(rawOwner).lean();
    if (!owner) throw new AppError(400, "userId user not found");
    if (owner.role !== "dropshipper" && owner.role !== "vendor") {
      throw new AppError(400, "userId must be a vendor or dropshipper account");
    }
    ownerUserId = new mongoose.Types.ObjectId(rawOwner);
    ownerRole = owner.role;
  } else {
    ownerUserId = req.user._id;
    ownerRole = req.user.role;
  }

  const label = pickupLabelFromBody(b);
  const contactName = pickupContactFromBody(b);
  const addressLine1 = trimStr(b.addressLine1);
  const addressLine2 = trimStr(b.addressLine2);
  const landmark = trimStr(b.landmark);
  const city = trimStr(b.city);
  const state = trimStr(b.state);
  const pincode = normalizePincodeIndia(trimStr(b.pincode));
  const country = trimStr(b.country) || "India";
  const phone = normalizePhoneInput(trimStr(b.phone));
  const alternatePhone = normalizePhoneInput(trimStr(b.alternatePhone));
  const email = trimStr(b.email).toLowerCase();
  const gstinRaw = trimStr(b.gstin).toUpperCase();

  if (!label) throw new AppError(400, "label, pickupName, or warehouseName is required");
  if (!contactName) throw new AppError(400, "contactName or contactPerson is required");
  if (!addressLine1) throw new AppError(400, "addressLine1 is required");
  if (!city) throw new AppError(400, "city is required");
  if (!state) throw new AppError(400, "state is required");
  validateIndianPincode(pincode);
  validateIndianPhone(phone, "phone", true);
  validateIndianPhone(alternatePhone, "alternatePhone", false);
  assertIndianPhonesDistinct(phone, alternatePhone);
  validateEmailOptional(email);
  validateGstinOptional(gstinRaw);

  const fp = pickupAddressFingerprint({
    addressLine1,
    addressLine2,
    city,
    state,
    pincode,
    country,
  });

  const scope = pickupOwnerScope(ownerUserId, ownerRole);
  const dupe = await Pickup.findOne({
    $and: [scope, { ...PICKUP_NOT_DELETED }, { addressFingerprint: fp }],
  })
    .select("_id")
    .lean();
  if (dupe) {
    throw new AppError(409, "A pickup address with the same details already exists for this account");
  }

  const wantDefault = Boolean(b.isDefault);
  const count = await Pickup.countDocuments({
    $and: [scope, { ...PICKUP_NOT_DELETED }],
  });
  const makeDefault = wantDefault || count === 0;
  if (makeDefault) {
    await clearDefaultPickupsForOwnerDoc({
      userId: ownerUserId,
      dropshipperId: ownerRole === "dropshipper" ? ownerUserId : null,
    });
  }

  const isActive = b.isActive === false ? false : true;

  const doc = await Pickup.create({
    userId: ownerUserId,
    dropshipperId: ownerRole === "dropshipper" ? ownerUserId : undefined,
    label,
    contactName,
    phone,
    alternatePhone: alternatePhone || undefined,
    email: email || undefined,
    addressLine1,
    addressLine2: addressLine2 || undefined,
    landmark: landmark || undefined,
    city,
    state,
    pincode,
    country,
    gstin: gstinRaw || undefined,
    addressFingerprint: fp,
    isDefault: makeDefault,
    isActive,
  });
  res.status(201).json({ success: true, data: mapPickupDoc(doc.toObject()) });
});

/**
 * Dropshipper-only: backfill `dropshipperId` on pickups where `userId` already matches but field was missing (legacy).
 * Does not modify documents owned by other users.
 */
export const repairDropshipperPickupOwnership = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "dropshipper") throw new AppError(403, "Forbidden");
  const result = await Pickup.updateMany(
    {
      $and: [
        { userId: req.user._id },
        { $or: [{ dropshipperId: { $exists: false } }, { dropshipperId: null }] },
        { ...PICKUP_NOT_DELETED },
      ],
    },
    { $set: { dropshipperId: req.user._id } }
  );
  res.json({
    success: true,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  });
});

/** @deprecated Use POST /pickup-addresses */
export const createPickup = createPickupAddress;

export const updatePickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  assertPickupApiRole(req.user.role);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const existing = await Pickup.findOne({
    $and: [{ _id: id }, pickupListQuery(req.user, { includeInactive: true })],
  });
  if (!existing) throw new AppError(404, "Pickup address not found");

  const b = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (b.label !== undefined || b.pickupName !== undefined || b.warehouseName !== undefined) {
    patch.label = pickupLabelFromBody({
      label: b.label,
      pickupName: b.pickupName,
      warehouseName: b.warehouseName,
    } as Record<string, unknown>);
  }
  if (b.contactName !== undefined || b.contactPerson !== undefined) {
    patch.contactName = pickupContactFromBody({
      contactName: b.contactName,
      contactPerson: b.contactPerson,
    } as Record<string, unknown>);
  }
  if (b.phone !== undefined) patch.phone = normalizePhoneInput(trimStr(b.phone));
  if (b.alternatePhone !== undefined) patch.alternatePhone = normalizePhoneInput(trimStr(b.alternatePhone));
  if (b.email !== undefined) patch.email = trimStr(b.email).toLowerCase();
  if (b.addressLine1 !== undefined) patch.addressLine1 = trimStr(b.addressLine1);
  if (b.addressLine2 !== undefined) patch.addressLine2 = trimStr(b.addressLine2);
  if (b.landmark !== undefined) patch.landmark = trimStr(b.landmark);
  if (b.city !== undefined) patch.city = trimStr(b.city);
  if (b.state !== undefined) patch.state = trimStr(b.state);
  if (b.pincode !== undefined) patch.pincode = normalizePincodeIndia(trimStr(b.pincode));
  if (b.country !== undefined) patch.country = trimStr(b.country) || "India";
  if (b.gstin !== undefined) patch.gstin = trimStr(b.gstin).toUpperCase();
  if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);

  if (b.isDefault === true) {
    await clearDefaultPickupsForOwnerDoc({
      userId: existing.userId,
      dropshipperId: existing.dropshipperId,
    });
    patch.isDefault = true;
  }

  Object.assign(existing, patch);

  const label = trimStr(existing.label);
  const contactName = trimStr(existing.contactName);
  const addressLine1 = trimStr(existing.addressLine1);
  const addressLine2 = trimStr(existing.addressLine2 ?? "");
  const landmark = trimStr(existing.landmark ?? "");
  const city = trimStr(existing.city);
  const state = trimStr(existing.state);
  const pincode = normalizePincodeIndia(trimStr(existing.pincode));
  const country = trimStr(existing.country) || "India";
  const phone = normalizePhoneInput(trimStr(existing.phone));
  const alternatePhone = normalizePhoneInput(trimStr(existing.alternatePhone ?? ""));
  const email = trimStr(existing.email ?? "").toLowerCase();
  const gstinVal = trimStr(existing.gstin ?? "").toUpperCase();

  if (!label) throw new AppError(400, "label, pickupName, or warehouseName is required");
  if (!contactName) throw new AppError(400, "contactName or contactPerson is required");
  if (!addressLine1) throw new AppError(400, "addressLine1 is required");
  if (!city) throw new AppError(400, "city is required");
  if (!state) throw new AppError(400, "state is required");
  validateIndianPincode(pincode);
  validateIndianPhone(phone, "phone", true);
  validateIndianPhone(alternatePhone, "alternatePhone", false);
  assertIndianPhonesDistinct(phone, alternatePhone);
  validateEmailOptional(email);
  validateGstinOptional(gstinVal);

  const fp = pickupAddressFingerprint({ addressLine1, addressLine2, city, state, pincode, country });

  const scope =
    existing.dropshipperId != null
      ? { $or: [{ userId: existing.userId }, { dropshipperId: existing.dropshipperId }] }
      : { userId: existing.userId };
  const dupe = await Pickup.findOne({
    $and: [scope, { ...PICKUP_NOT_DELETED }, { addressFingerprint: fp }, { _id: { $ne: existing._id } }],
  })
    .select("_id")
    .lean();
  if (dupe) {
    throw new AppError(409, "A pickup address with the same details already exists for this account");
  }

  existing.label = label;
  existing.contactName = contactName;
  existing.addressLine1 = addressLine1;
  existing.addressLine2 = addressLine2 || undefined;
  existing.landmark = landmark || undefined;
  existing.city = city;
  existing.state = state;
  existing.pincode = pincode;
  existing.country = country;
  existing.phone = phone;
  existing.alternatePhone = alternatePhone || undefined;
  existing.email = email || "";
  existing.gstin = gstinVal || undefined;
  existing.addressFingerprint = fp;

  await existing.save();
  res.json({ success: true, data: mapPickupDoc(existing.toObject()) });
});

export const deletePickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  assertPickupApiRole(req.user.role);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const doc = await Pickup.findOne({
    $and: [{ _id: id }, pickupListQuery(req.user, { includeInactive: true })],
  });
  if (!doc) throw new AppError(404, "Pickup address not found");

  const wasDefault = doc.isDefault;
  doc.deletedAt = new Date();
  doc.isActive = false;
  doc.isDefault = false;
  await doc.save();

  if (wasDefault) {
    const ownerScope =
      doc.dropshipperId != null
        ? { $or: [{ userId: doc.userId }, { dropshipperId: doc.dropshipperId }] }
        : { userId: doc.userId };
    const next = await Pickup.findOne({
      $and: [ownerScope, { ...PICKUP_NOT_DELETED }, { ...PICKUP_ACTIVE }],
    }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  res.json({ success: true, message: "Pickup address removed", data: null });
});

export const setDefaultPickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  assertPickupApiRole(req.user.role);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const doc = await Pickup.findOne({
    $and: [{ _id: id }, pickupListQuery(req.user, { includeInactive: false })],
  });
  if (!doc) throw new AppError(404, "Pickup address not found or inactive");

  await clearDefaultPickupsForOwnerDoc({
    userId: doc.userId,
    dropshipperId: doc.dropshipperId,
  });
  doc.isDefault = true;
  await doc.save();
  res.json({ success: true, data: mapPickupDoc(doc.toObject()) });
});

export const listWeightDisputes = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rows = await WeightDispute.find().sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((w) => ({
      id: w.disputeId,
      orderId: w.orderId,
      awb: w.awb,
      courier: w.courier,
      sellerWeight: w.sellerWeight,
      courierWeight: w.courierWeight,
      diff: w.diff,
      chargedAmount: w.chargedAmount,
      expectedAmount: w.expectedAmount,
      status: w.status,
      date: w.date,
    }))
  );
});

export const listMarketplaceProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await Product.find({ status: "active" }).sort({ createdAt: -1 }).lean();
  res.json(rows);
});

export const listProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  let q: Record<string, unknown> = {};
  if (req.user.role === "admin") {
    q = {};
  } else if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ userId: req.user._id });
    if (v) q = { vendorId: v._id };
  } else if (req.user.role === "dropshipper") {
    q = { uploadedBy: req.user._id };
  }
  const rows = await Product.find(q).sort({ createdAt: -1 }).lean();
  res.json(rows);
});

export const createProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const vendor = await Vendor.findOne({ userId: req.user._id });
  const body = { ...req.body, uploadedBy: req.user._id, uploadedByRole: req.user.role };
  if (vendor) Object.assign(body, { vendorId: vendor._id, vendorName: vendor.name });
  const p = await Product.create(body);
  res.status(201).json(p);
});

export const updateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id);
  if (!p) throw new AppError(404, "Product not found");
  if (req.user.role === "admin") {
    Object.assign(p, req.body);
    await p.save();
    res.json(p);
    return;
  }
  if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ userId: req.user._id });
    if (!v || String(p.vendorId) !== String(v._id)) throw new AppError(403, "Forbidden");
    Object.assign(p, req.body);
    await p.save();
    res.json(p);
    return;
  }
  if (req.user.role === "dropshipper") {
    if (String(p.uploadedBy) !== String(req.user._id)) throw new AppError(403, "Forbidden");
    Object.assign(p, req.body);
    await p.save();
    res.json(p);
    return;
  }
  throw new AppError(403, "Forbidden");
});

export const deleteProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const p = await Product.findById(req.params.id);
  if (!p) throw new AppError(404, "Product not found");
  if (req.user.role === "admin") {
    await p.deleteOne();
    res.json({ ok: true });
    return;
  }
  if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ userId: req.user._id });
    if (!v || String(p.vendorId) !== String(v._id)) throw new AppError(403, "Forbidden");
    await p.deleteOne();
    res.json({ ok: true });
    return;
  }
  if (req.user.role === "dropshipper") {
    if (String(p.uploadedBy) !== String(req.user._id)) throw new AppError(403, "Forbidden");
    await p.deleteOne();
    res.json({ ok: true });
    return;
  }
  throw new AppError(403, "Forbidden");
});

export const listProductRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const q =
    req.user.role === "admin"
      ? {}
      : { userId: req.user._id };
  const rows = await ProductRequest.find(q).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((r) => ({
      id: String(r._id),
      ...((r.payload as object) || {}),
      status: r.status,
      created_at: r.createdAt,
    }))
  );
});

export const createProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await ProductRequest.create({
    userId: req.user._id,
    role: req.user.role,
    payload: req.body,
    status: "pending",
  });
  res.status(201).json({ id: String(doc._id), ...req.body, status: doc.status });
});

export const updateProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const pr = await ProductRequest.findById(req.params.id);
  if (!pr) throw new AppError(404, "Not found");
  Object.assign(pr, req.body);
  await pr.save();
  res.json(pr);
});

export const deleteProductRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  await ProductRequest.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/** Tab permissions: effective for current user */
export const getMyTabPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin") {
    res.json([]);
    return;
  }
  if (req.user.role !== "vendor" && req.user.role !== "dropshipper") {
    res.json([]);
    return;
  }
  const role = req.user.role;
  const defaults = await TabPermission.find({ role, userId: null }).lean();
  const overrides = await TabPermission.find({ role, userId: req.user._id }).lean();
  const map = new Map<string, boolean>();
  for (const d of defaults) map.set(d.tabKey, d.enabled);
  for (const o of overrides) map.set(o.tabKey, o.enabled);
  res.json(
    [...map.entries()].map(([tab_key, enabled]) => ({
      tab_key,
      enabled,
    }))
  );
});

export const listTabDefaults = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const rows = await TabPermission.find({ userId: null }).lean();
  res.json(
    rows.map((r) => ({
      role: r.role,
      tabKey: r.tabKey,
      enabled: r.enabled,
      userId: r.userId,
    }))
  );
});

export const upsertTabDefault = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { role, tabKey, enabled } = req.body as { role: string; tabKey: string; enabled: boolean };
  await TabPermission.findOneAndUpdate(
    { role, userId: null, tabKey },
    { role, userId: null, tabKey, enabled },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

export const listUserTabOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { userId, role } = req.query as { userId?: string; role?: string };
  if (!userId || !role) throw new AppError(400, "userId and role required");
  const uid = new mongoose.Types.ObjectId(userId);
  const rows = await TabPermission.find({ userId: uid, role }).lean();
  res.json(rows.map((r) => ({ tab_key: r.tabKey, enabled: r.enabled })));
});

export const upsertUserTabOverride = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { userId, role, tabKey, enabled } = req.body as {
    userId: string;
    role: string;
    tabKey: string;
    enabled: boolean;
  };
  const uid = new mongoose.Types.ObjectId(userId);
  await TabPermission.findOneAndUpdate(
    { userId: uid, role, tabKey },
    { userId: uid, role, tabKey, enabled },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

export const resetUserTabOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { userId, role } = req.query as { userId?: string; role?: string };
  if (!userId || !role) throw new AppError(400, "userId and role required");
  const uid = new mongoose.Types.ObjectId(userId);
  await TabPermission.deleteMany({ userId: uid, role });
  res.json({ ok: true });
});

export const listVendorAccounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const users = await User.find({ role: "vendor" }).lean();
  res.json(
    users.map((u) => ({
      user_id: String(u._id),
      full_name: u.name,
      business_name: u.companyName,
    }))
  );
});
