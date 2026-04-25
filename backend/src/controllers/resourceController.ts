import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { User } from "../models/User.js";
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
import mongoose from "mongoose";

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
  const w = await Wallet.findOne({ userId: req.user._id });
  res.json({ balance: w?.balance ?? 0, currency: w?.currency ?? "INR" });
});

export const listTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((t) => ({
      id: t.txnId,
      date: t.date,
      description: t.description,
      txnId: t.txnId,
      type: t.type,
      amount: t.amount,
      balance: t.balance,
    }))
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

export const listPickups = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await Pickup.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((a) => ({
      id: String(a._id),
      label: a.label,
      contactName: a.contactName,
      phone: a.phone,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      isDefault: a.isDefault,
    }))
  );
});

export const createPickup = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await Pickup.create({ ...req.body, userId: req.user._id });
  res.status(201).json(doc);
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
