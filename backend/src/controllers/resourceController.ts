import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { User, type UserRole } from "../models/User.js";
import { getPickupOwnerFilterForUser } from "../utils/pickupOwnerFilter.js";
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

function transactionDisplayType(ledgerType: string | undefined, type: "Credit" | "Debit"): string {
  const lt = (ledgerType || "general").toLowerCase();
  if (lt === "manual_credit_request" || lt === "recharge") return "Recharge";
  if (lt === "cod" || lt === "cod_settlement") return "COD";
  if (lt === "deduction" || lt === "shipping" || lt === "fee") return "Deduction";
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
    const rows = await Warehouse.find({ vendorId: vendor._id });
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
  await Warehouse.deleteOne({ _id: req.params.id, vendorId: vendor._id });
  res.json({ ok: true });
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
  const uid = req.user._id;
  let w = await Wallet.findOne({ userId: uid });
  if (!w) {
    w = await Wallet.create({ userId: uid, balance: 0, currency: "INR" });
  }

  const [pendingCodAgg, rechargeAgg, deductionAgg] = await Promise.all([
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
          $and: [
            { userId: uid },
            { $or: [{ status: "completed" }, { status: { $exists: false } }, { status: null }] },
            { type: "Credit" },
            {
              $or: [
                { ledgerType: { $exists: false } },
                { ledgerType: null },
                { ledgerType: "" },
                { ledgerType: "general" },
                { ledgerType: "recharge" },
                { ledgerType: "manual_credit_request" },
              ],
            },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate<{ total?: number }>([
      {
        $match: {
          $and: [
            { userId: uid },
            { $or: [{ status: "completed" }, { status: { $exists: false } }, { status: null }] },
            { type: "Debit" },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const pendingCod = pendingCodAgg[0]?.total ?? 0;
  const totalRecharge = rechargeAgg[0]?.total ?? 0;
  const totalDeductions = deductionAgg[0]?.total ?? 0;
  const lastSyncedAt = (w.updatedAt ?? w.createdAt ?? new Date()).toISOString();

  res.json({
    balance: w.balance ?? 0,
    pendingCod,
    totalRecharge,
    totalDeductions,
    lastSyncedAt,
    currency: w.currency ?? "INR",
  });
});

export const addFunds = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const raw = (req.body as { amount?: unknown }).amount;
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount < 100) {
    throw new AppError(400, "Minimum add-funds amount is ₹100");
  }

  let w = await Wallet.findOne({ userId: req.user._id });
  if (!w) {
    w = await Wallet.create({ userId: req.user._id, balance: 0, currency: "INR" });
  }
  const balanceAfter = w.balance ?? 0;
  const txnId = `WREQ-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const dateStr = new Date().toISOString().slice(0, 10);

  await Transaction.create({
    userId: req.user._id,
    txnId,
    date: dateStr,
    description: `Add funds — ₹${amount} (pending payment / manual credit request)`,
    type: "Credit",
    amount,
    balance: balanceAfter,
    status: "pending",
    ledgerType: "manual_credit_request",
  });

  res.status(201).json({
    success: true,
    message: "Funds request recorded. Balance will update after payment is confirmed.",
    transaction: { txnId, amount, status: "pending" as const },
  });
});

export const listTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((t) => {
      const ledgerType = (t as { ledgerType?: string }).ledgerType ?? "general";
      const status = (t as { status?: string }).status ?? "completed";
      const createdAt = (t as { createdAt?: Date }).createdAt;
      const date =
        t.date ||
        (createdAt ? new Date(createdAt).toISOString().slice(0, 10) : "");
      return {
        id: t.txnId,
        date,
        description: t.description,
        txnId: t.txnId,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        status,
        ledgerType,
        displayType: transactionDisplayType(ledgerType, t.type as "Credit" | "Debit"),
        createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
      };
    })
  );
});

export const listCodRemittances = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const q = req.user.role === "admin" ? {} : { userId: req.user._id };
  const rows = await CodRemittance.find(q).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((c) => ({
      id: c.remittanceId,
      dropshipper: c.dropshipper,
      ordersCount: c.ordersCount,
      codAmount: c.codAmount,
      deductions: c.deductions,
      netPayable: c.netPayable,
      status: c.status,
      settleDate: c.settleDate,
      utr: c.utr,
    }))
  );
});

export const listInvoices = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const q = req.user.role === "admin" ? {} : { userId: req.user._id };
  const rows = await Invoice.find(q).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((inv) => ({
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
    }))
  );
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

function mapPickupDoc(a: {
  _id: unknown;
  label: string;
  contactName?: string;
  phone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefault?: boolean;
  isActive?: boolean;
  velocityWarehouseId?: string;
}) {
  return {
    id: String(a._id),
    label: a.label,
    contactName: a.contactName ?? "",
    phone: a.phone ?? "",
    email: a.email ?? "",
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country ?? "India",
    isDefault: Boolean(a.isDefault),
    isActive: a.isActive !== false,
    velocityWarehouseId:
      typeof a.velocityWarehouseId === "string" && a.velocityWarehouseId.trim()
        ? a.velocityWarehouseId.trim()
        : undefined,
  };
}

async function clearDefaultPickupsForUser(userId: Types.ObjectId, role: UserRole) {
  const filter =
    role === "dropshipper"
      ? { $or: [{ userId }, { dropshipperId: userId }] }
      : { userId };
  await Pickup.updateMany(filter, { $set: { isDefault: false } });
}

export const listPickupAddresses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const rows = await Pickup.find({
    ...getPickupOwnerFilterForUser(req.user),
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json(rows.map(mapPickupDoc));
});

/** @deprecated Use GET /pickup-addresses — kept for older clients */
export const listPickups = listPickupAddresses;

export const createPickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const b = req.body as Record<string, unknown>;
  const ownerUserId = String(b.userId ?? "").trim();
  if (!ownerUserId) throw new AppError(400, "userId (dropshipper user id) is required");
  if (!mongoose.isValidObjectId(ownerUserId)) throw new AppError(400, "Invalid userId");
  const owner = await User.findById(ownerUserId).lean();
  if (!owner || owner.role !== "dropshipper") throw new AppError(400, "userId must be a dropshipper account");
  const label = String(b.label ?? "").trim();
  const addressLine1 = String(b.addressLine1 ?? "").trim();
  const city = String(b.city ?? "").trim();
  const state = String(b.state ?? "").trim();
  const pincode = String(b.pincode ?? "").trim();
  if (!label || !addressLine1 || !city || !state || !pincode) {
    throw new AppError(400, "label, addressLine1, city, state, and pincode are required");
  }

  const wantDefault = Boolean(b.isDefault);
  const ownerFilter = { $or: [{ userId: new mongoose.Types.ObjectId(ownerUserId) }, { dropshipperId: new mongoose.Types.ObjectId(ownerUserId) }] };
  const count = await Pickup.countDocuments(ownerFilter);
  const makeDefault = wantDefault || count === 0;
  if (makeDefault) await clearDefaultPickupsForUser(new mongoose.Types.ObjectId(ownerUserId), "dropshipper");

  const doc = await Pickup.create({
    userId: new mongoose.Types.ObjectId(ownerUserId),
    dropshipperId: new mongoose.Types.ObjectId(ownerUserId),
    label,
    contactName: String(b.contactName ?? "").trim(),
    phone: String(b.phone ?? "").trim(),
    email: String(b.email ?? "").trim(),
    addressLine1,
    addressLine2: String(b.addressLine2 ?? "").trim(),
    city,
    state,
    pincode,
    country: String(b.country ?? "India").trim() || "India",
    isDefault: makeDefault,
    isActive: b.isActive === false ? false : true,
  });
  res.status(201).json(mapPickupDoc(doc.toObject()));
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
      userId: req.user._id,
      $or: [{ dropshipperId: { $exists: false } }, { dropshipperId: null }],
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
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const existing = await Pickup.findOne({ _id: id, ...getPickupOwnerFilterForUser(req.user) });
  if (!existing) throw new AppError(404, "Pickup address not found");

  const b = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (b.label !== undefined) patch.label = String(b.label).trim();
  if (b.contactName !== undefined) patch.contactName = String(b.contactName).trim();
  if (b.phone !== undefined) patch.phone = String(b.phone).trim();
  if (b.email !== undefined) patch.email = String(b.email).trim();
  if (b.addressLine1 !== undefined) patch.addressLine1 = String(b.addressLine1).trim();
  if (b.addressLine2 !== undefined) patch.addressLine2 = String(b.addressLine2).trim();
  if (b.city !== undefined) patch.city = String(b.city).trim();
  if (b.state !== undefined) patch.state = String(b.state).trim();
  if (b.pincode !== undefined) patch.pincode = String(b.pincode).trim();
  if (b.country !== undefined) patch.country = String(b.country).trim() || "India";
  if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);

  if (b.isDefault === true) {
    await clearDefaultPickupsForUser(req.user._id, req.user.role);
    patch.isDefault = true;
  }

  Object.assign(existing, patch);
  const label = String(existing.label ?? "").trim();
  const addressLine1 = String(existing.addressLine1 ?? "").trim();
  const city = String(existing.city ?? "").trim();
  const state = String(existing.state ?? "").trim();
  const pincode = String(existing.pincode ?? "").trim();
  if (!label || !addressLine1 || !city || !state || !pincode) {
    throw new AppError(400, "label, addressLine1, city, state, and pincode are required");
  }
  await existing.save();
  res.json(mapPickupDoc(existing.toObject()));
});

export const deletePickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const doc = await Pickup.findOne({ _id: id, ...getPickupOwnerFilterForUser(req.user) });
  if (!doc) throw new AppError(404, "Pickup address not found");

  const wasDefault = doc.isDefault;
  await Pickup.deleteOne({ _id: id, ...getPickupOwnerFilterForUser(req.user) });

  if (wasDefault) {
    const next = await Pickup.findOne({
      userId: doc.userId,
      _id: { $ne: doc._id },
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  res.json({ success: true });
});

export const setDefaultPickupAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const doc = await Pickup.findOne({
    _id: id,
    ...getPickupOwnerFilterForUser(req.user),
    isActive: { $ne: false },
  });
  if (!doc) throw new AppError(404, "Pickup address not found");

  await clearDefaultPickupsForUser(doc.userId, "dropshipper");
  doc.isDefault = true;
  await doc.save();
  res.json(mapPickupDoc(doc.toObject()));
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
  const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!p) throw new AppError(404, "Product not found");
  res.json(p);
});

export const deleteProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const r = await Product.findByIdAndDelete(req.params.id);
  if (!r) throw new AppError(404, "Product not found");
  res.json({ ok: true });
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
