import type { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { Product } from "../models/Product.js";
import { Profile } from "../models/Profile.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { User, type UserRole } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { sendWelcomeEmail } from "../services/email/emailService.js";
import { Order } from "../models/Order.js";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { SupportTicket, SUPPORT_TICKET_CATEGORIES, type SupportTicketCategory, type SupportTicketPriority, type SupportTicketStatus, type ISupportAttachment } from "../models/SupportTicket.js";
import { ACTIVITY_ACTIONS, recordUserActivity } from "../services/userActivityService.js";
import mongoose from "mongoose";
import { createInAppNotification, notifyAllAdmins } from "../services/inAppNotifications.js";
import { randomBytes } from "crypto";
import { getFinalProductPrice, resolveOurCommission, resolveShippingCharge } from "../utils/productPricing.js";
import { assertProductPermission, PRODUCT_PERMISSIONS } from "../utils/productPermissions.js";
import { devLog } from "../utils/devLog.js";
import { buildProductListPipeline } from "../utils/productListPayload.js";

function assertAdmin(req: AuthRequest): void {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Forbidden");
}

/** Minimal directory for ticket assignment (no sensitive vendor/dropshipper data). */
export const adminListAdminUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const rows = await User.find({ role: "admin", status: "active" }).select("name email").lean();
  res.json(
    rows.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
    }))
  );
});

const ADMIN_USER_ROLES = ["admin", "vendor", "dropshipper"] as const;

const adminCreateUserSchema = z.object({
  name: z.string().min(1, "Full name is required").max(120),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ADMIN_USER_ROLES),
  companyName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  permissions: z.array(z.string().max(80)).max(50).optional(),
  sendWelcomeEmail: z.boolean().optional(),
  accessType: z.enum(["FULL", "RESTRICTED"]).optional(),
  allowWarehouseAccess: z.boolean().optional(),
});

const adminPatchUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).optional(),
  companyName: z.string().max(200).optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  permissions: z.array(z.string().max(80)).max(50).optional(),
  accessType: z.enum(["FULL", "RESTRICTED"]).optional(),
  allowWarehouseAccess: z.boolean().optional(),
});

const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

function mapAdminUserRow(u: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  companyName?: string;
  phone?: string;
  status: string;
  permissions?: string[];
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    companyName: u.companyName ?? "",
    phone: u.phone ?? "",
    status: u.status,
    permissions: u.permissions ?? [],
    emailVerified: u.emailVerified !== false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function createRoleSideRecords(
  user: { _id: unknown; role: UserRole; name: string; companyName?: string },
  opts?: { accessType?: "FULL" | "RESTRICTED"; allowWarehouseAccess?: boolean }
) {
  await Profile.create({ userId: user._id });
  await Wallet.create({ userId: user._id, balance: 0, currency: "INR" });

  if (user.role === "vendor") {
    await Vendor.create({
      userId: user._id,
      name: user.companyName || user.name,
      city: "",
      pin: "",
      assignedVendors: 0,
      ordersToday: 0,
      status: "Active",
    });
  } else if (user.role === "dropshipper") {
    const accessType = opts?.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL";
    const allowWarehouseAccess =
      typeof opts?.allowWarehouseAccess === "boolean"
        ? opts.allowWarehouseAccess
        : accessType !== "RESTRICTED";
    await Dropshipper.create({
      userId: user._id,
      totalOrders: 0,
      activeOrders: 0,
      kycVerified: false,
      joinDate: new Date(),
      accessType,
      allowWarehouseAccess,
    });
  }
}

/** Admin: create user with any role (admin, vendor, dropshipper). */
export const adminCreateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const body = adminCreateUserSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const exists = await User.findOne({ email });
  if (exists) throw new AppError(409, "This email is already registered");

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({
    name: body.name.trim(),
    email,
    passwordHash,
    role: body.role,
    companyName: body.companyName?.trim() ?? "",
    phone: body.phone?.trim() ?? "",
    permissions: body.permissions ?? [],
    status: body.status ?? "active",
    emailVerified: true,
  });

  await createRoleSideRecords(user, {
    accessType: body.accessType,
    allowWarehouseAccess: body.allowWarehouseAccess,
  });

  if (body.sendWelcomeEmail !== false) {
    void sendWelcomeEmail(user.email, user.name, user.role);
  }

  res.status(201).json({ user: mapAdminUserRow(user) });
});

/** Admin: list all users with search, role/status filters, pagination. */
export const adminListUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const { page, limit, skip } = parsePagination(req);
  const search = String(req.query.search ?? "").trim();
  const role = String(req.query.role ?? "").trim();
  const status = String(req.query.status ?? "").trim();

  const q: Record<string, unknown> = {};
  if (role && ADMIN_USER_ROLES.includes(role as (typeof ADMIN_USER_ROLES)[number])) {
    q.role = role;
  }
  if (status === "active" || status === "inactive" || status === "blocked") {
    q.status = status;
  }
  if (search) {
    const rx = escapeRegex(search);
    q.$or = [
      { name: { $regex: rx, $options: "i" } },
      { email: { $regex: rx, $options: "i" } },
      { companyName: { $regex: rx, $options: "i" } },
      { phone: { $regex: rx, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    User.find(q).select("-passwordHash").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(q),
  ]);

  res.json({
    items: rows.map((u) => mapAdminUserRow(u)),
    total,
    page,
    limit,
  });
});

/** Admin: get single user by id. */
export const adminGetUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const u = await User.findById(id).select("-passwordHash").lean();
  if (!u) throw new AppError(404, "User not found");

  let dropshipperMeta: { accessType: string; allowWarehouseAccess: boolean } | null = null;
  if (u.role === "dropshipper") {
    const d = await Dropshipper.findOne({ userId: u._id }).select("accessType allowWarehouseAccess").lean();
    if (d) {
      dropshipperMeta = {
        accessType: d.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL",
        allowWarehouseAccess:
          typeof d.allowWarehouseAccess === "boolean"
            ? d.allowWarehouseAccess
            : d.accessType !== "RESTRICTED",
      };
    }
  }

  res.json({ user: { ...mapAdminUserRow(u), dropshipper: dropshipperMeta } });
});

/** Admin: update user fields (name, status, permissions, etc.). */
export const adminPatchUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const body = adminPatchUserSchema.parse(req.body);

  const user = await User.findById(id);
  if (!user) throw new AppError(404, "User not found");

  if (body.name !== undefined) user.name = body.name.trim();
  if (body.phone !== undefined) user.phone = body.phone.trim();
  if (body.companyName !== undefined) user.companyName = body.companyName.trim();
  if (body.status !== undefined) user.status = body.status;
  if (body.permissions !== undefined) user.permissions = body.permissions;

  await user.save();

  if (user.role === "dropshipper" && (body.accessType !== undefined || body.allowWarehouseAccess !== undefined)) {
    const d = await Dropshipper.findOne({ userId: user._id });
    if (d) {
      if (body.accessType === "FULL" || body.accessType === "RESTRICTED") d.accessType = body.accessType;
      if (typeof body.allowWarehouseAccess === "boolean") d.allowWarehouseAccess = body.allowWarehouseAccess;
      await d.save();
    }
  }

  res.json({ user: mapAdminUserRow(user) });
});

/** Admin: reset a user's password. */
export const adminResetUserPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const body = adminResetPasswordSchema.parse(req.body);

  const user = await User.findById(id);
  if (!user) throw new AppError(404, "User not found");

  user.passwordHash = await bcrypt.hash(body.newPassword, 10);
  await user.save();

  res.json({ ok: true, message: "Password updated successfully" });
});

function parsePagination(req: { query: Record<string, unknown> }) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

/** Admin catalogue: search, filters, sort, pagination */
export const adminListCatalogueProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertProductPermission(req.user!, PRODUCT_PERMISSIONS.VIEW);
  const { page, limit, skip } = parsePagination(req);
  const q: Record<string, unknown> = {};
  const andClauses: Record<string, unknown>[] = [];

  const search = String(req.query.search ?? "").trim();
  if (search) {
    andClauses.push({
      $or: [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { sku: { $regex: escapeRegex(search), $options: "i" } },
        { vendorSku: { $regex: escapeRegex(search), $options: "i" } },
        { vendorName: { $regex: escapeRegex(search), $options: "i" } },
      ],
    });
  }

  const category = String(req.query.category ?? "").trim();
  if (category) q.category = category;

  const vendorId = String(req.query.vendorId ?? "").trim();
  if (vendorId && mongoose.isValidObjectId(vendorId)) q.vendorId = new mongoose.Types.ObjectId(vendorId);

  const status = String(req.query.status ?? "").trim().toLowerCase();
  if (status && status !== "all") {
    if (status === "active" || status === "inactive" || status === "draft" || status === "pending_review" || status === "rejected") {
      q.status = status;
    }
  }

  const stockStatus = String(req.query.stockStatus ?? "").trim().toLowerCase();
  if (stockStatus === "out_of_stock") {
    andClauses.push({ $or: [{ stock: { $lte: 0 } }, { stock: { $exists: false } }] });
  }
  if (stockStatus === "low") andClauses.push({ stock: { $gt: 0, $lte: 5 } });
  if (stockStatus === "in_stock") andClauses.push({ stock: { $gt: 5 } });

  const dateFrom = String(req.query.dateFrom ?? "").trim();
  const dateTo = String(req.query.dateTo ?? "").trim();
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

  if (andClauses.length) q.$and = andClauses;

  const featuredOnly = String(req.query.featuredOnly ?? "").trim();
  if (featuredOnly === "true") q.isFeatured = true;

  const sortParam = String(req.query.sort ?? "-createdAt");
  const sort: Record<string, 1 | -1> = {};
  if (sortParam === "name") sort.name = 1;
  else if (sortParam === "-name") sort.name = -1;
  else if (sortParam === "createdAt") sort.createdAt = 1;
  else if (sortParam === "profit_desc") { sort.sellingPrice = -1; }
  else sort.createdAt = -1;

  const rowsStarted = process.hrtime.bigint();
  const rowsPromise = Product.aggregate(
    buildProductListPipeline(q, sort, { skip, limit })
  )
    .allowDiskUse(true)
    .then((result) => {
      const rowsMs = Number(process.hrtime.bigint() - rowsStarted) / 1_000_000;
      devLog.info(`[admin:catalogue] rows=${result.length} query=${rowsMs.toFixed(0)}ms`);
      return result;
    });
  const countStarted = process.hrtime.bigint();
  const countPromise = (Object.keys(q).length === 0 ? Product.estimatedDocumentCount() : Product.countDocuments(q)).then((result) => {
    const countMs = Number(process.hrtime.bigint() - countStarted) / 1_000_000;
    devLog.info(`[admin:catalogue] total=${result} count=${countMs.toFixed(0)}ms`);
    return result;
  });

  const [rows, total] = await Promise.all([rowsPromise, countPromise]);

  res.json({
    items: rows.map((p) => mapProductLean(p as Record<string, unknown>)),
    total,
    page,
    limit,
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapProductLean(p: Record<string, unknown>) {
  const price = Number(p.price ?? 0);
  const shippingCharge = resolveShippingCharge(p);
  const ourCommission = resolveOurCommission(p);
  return {
    _id: String(p._id),
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    vendorSku: p.vendorSku,
    category: p.category,
    price,
    sellingPrice: p.sellingPrice,
    shippingCharge,
    ourCommission,
    finalPrice: getFinalProductPrice(p),
    stock: p.stock,
    status: p.status,
    vendorId: p.vendorId ? String(p.vendorId) : null,
    vendorName: p.vendorName,
    uploadedBy: p.uploadedBy ? String(p.uploadedBy) : null,
    uploadedByRole: p.uploadedByRole,
    images: p.images,
    hasImage: p.hasImage === true,
    isFeatured: p.isFeatured === true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const adminPatchCatalogueProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const body = req.body as Record<string, unknown>;
  if (body.vendor_sku !== undefined && body.vendorSku === undefined) body.vendorSku = body.vendor_sku;
  const allowed = ["status", "name", "sku", "vendorSku", "category", "price", "sellingPrice", "shippingCharge", "ourCommission", "stock", "isFeatured"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.status !== undefined) {
    assertProductPermission(req.user!, PRODUCT_PERMISSIONS.APPROVE);
  } else if (Object.keys(patch).length > 0) {
    assertProductPermission(req.user!, PRODUCT_PERMISSIONS.EDIT);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sku")) {
    const sku = String(patch.sku ?? "").trim();
    if (!sku) throw new AppError(400, "SKU cannot be empty");
    patch.sku = sku;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "vendorSku")) {
    const vendorSku = String(patch.vendorSku ?? "").trim();
    patch.vendorSku = vendorSku || undefined;
  }
  for (const key of ["price", "sellingPrice", "shippingCharge", "ourCommission", "stock"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = Number(patch[key]);
      if (!Number.isFinite(value) || value < 0) throw new AppError(400, `${key} must be a non-negative number`);
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) throw new AppError(400, "No valid fields");
  const p = await Product.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
  if (!p) throw new AppError(404, "Product not found");
  res.json(mapProductLean(p as Record<string, unknown>));
});

export const adminBulkCatalogueProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  assertProductPermission(req.user!, PRODUCT_PERMISSIONS.APPROVE);
  const { ids, action } = req.body as { ids?: unknown; action?: string };
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, "ids required");
  const oid = ids.filter((x) => mongoose.isValidObjectId(String(x))).map((x) => new mongoose.Types.ObjectId(String(x)));
  if (oid.length === 0) throw new AppError(400, "No valid ids");

  if (action === "feature") {
    const r = await Product.updateMany({ _id: { $in: oid } }, { $set: { isFeatured: true } });
    res.json({ ok: true, modified: r.modifiedCount });
    return;
  }
  if (action === "unfeature") {
    const r = await Product.updateMany({ _id: { $in: oid } }, { $set: { isFeatured: false } });
    res.json({ ok: true, modified: r.modifiedCount });
    return;
  }

  let status: string | undefined;
  if (action === "activate" || action === "approve") status = "active";
  else if (action === "deactivate") status = "inactive";
  else if (action === "reject") status = "rejected";
  else if (action === "pending_review") status = "pending_review";
  else throw new AppError(400, "Invalid action");

  const r = await Product.updateMany({ _id: { $in: oid } }, { $set: { status } });
  res.json({ ok: true, modified: r.modifiedCount });
});

/** Vendor row for admin list (extended) */
export const adminListVendors = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const { page, limit, skip } = parsePagination(req);
  const search = String(req.query.search ?? "").trim().toLowerCase();
  const accountStatus = String(req.query.accountStatus ?? "").trim();
  const vendorStatus = String(req.query.vendorStatus ?? "").trim();
  const blocked = String(req.query.blocked ?? "").trim();

  const userParts: Record<string, unknown>[] = [{ role: "vendor" }];
  if (accountStatus === "active" || accountStatus === "inactive") userParts.push({ status: accountStatus });
  if (blocked === "true") userParts.push({ status: "blocked" });
  else if (blocked === "false") userParts.push({ status: { $ne: "blocked" } });
  const userQuery = userParts.length > 1 ? { $and: userParts } : userParts[0];

  const started = process.hrtime.bigint();
  const users = await User.find(userQuery).select("_id name email phone companyName status").lean();
  const userIds = users.map((u) => u._id);
  let vendors = await Vendor.find({ userId: { $in: userIds } })
    .select("userId name city pin status assignedVendors ordersToday contactPerson phone email")
    .lean();

  const userMap = new Map(users.map((u) => [String(u._id), u]));

  let rows = vendors.map((v) => {
    const u = userMap.get(String(v.userId));
    return { v, u };
  });

  if (search) {
    rows = rows.filter(
      ({ v, u }) =>
        (u?.companyName && u.companyName.toLowerCase().includes(search)) ||
        (u?.name && u.name.toLowerCase().includes(search)) ||
        (v.name && v.name.toLowerCase().includes(search)) ||
        (u?.email && u.email.toLowerCase().includes(search)) ||
        (u?.phone && u.phone.includes(search))
    );
  }

  if (vendorStatus === "Active" || vendorStatus === "Inactive") {
    rows = rows.filter(({ v }) => v.status === vendorStatus);
  }

  const onboardingStatus = String(req.query.onboardingStatus ?? "").trim();
  if (onboardingStatus === "complete") {
    rows = rows.filter(({ u }) => u?.status === "active");
  } else if (onboardingStatus === "pending") {
    rows = rows.filter(({ u }) => u?.status === "inactive");
  }

  const total = rows.length;
  const slice = rows.slice(skip, skip + limit);
  const vendorIds = slice.map(({ v }) => v._id);
  const sliceUserIds = slice.map(({ v }) => v.userId);

  const [wallets, orderCounts, shops] = await Promise.all([
    Wallet.find({ userId: { $in: sliceUserIds } }).select("userId balance").lean(),
    Order.aggregate<{ _id: mongoose.Types.ObjectId; orderCount: number; shipmentCount: number }>([
      { $match: { vendorId: { $in: vendorIds } } },
      {
        $group: {
          _id: "$vendorId",
          orderCount: { $sum: 1 },
          shipmentCount: { $sum: { $cond: [{ $eq: ["$shipmentCreated", true] }, 1, 0] } },
        },
      },
    ]),
    ShopifyStoreConnection.find({ ownerUserId: { $in: sliceUserIds }, isActive: true })
      .select("ownerUserId shopDomain lastSyncedAt syncCount")
      .lean(),
  ]);
  const walletMap = new Map(wallets.map((wallet) => [String(wallet.userId), wallet]));
  const orderCountMap = new Map(orderCounts.map((count) => [String(count._id), count]));
  const shopMap = new Map(shops.map((shop) => [String(shop.ownerUserId), shop]));
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  devLog.info(`[admin:vendors] users=${users.length} vendors=${vendors.length} pageRows=${slice.length} query=${elapsedMs.toFixed(0)}ms`);

  const out = slice.map(({ v, u }) => {
      const wallet = walletMap.get(String(v.userId));
      const counts = orderCountMap.get(String(v._id));
      const shop = shopMap.get(String(v.userId));
      return {
        id: String(v._id),
        userId: String(v.userId),
        name: v.name,
        city: v.city,
        pin: v.pin,
        vendorStatus: v.status,
        assignedVendors: v.assignedVendors,
        ordersToday: v.ordersToday,
        contactPerson: v.contactPerson,
        phone: v.phone || u?.phone,
        email: v.email || u?.email,
        accountName: u?.name,
        companyName: u?.companyName,
        accountStatus: u?.status,
        walletBalance: wallet?.balance ?? 0,
        orderCount: counts?.orderCount ?? 0,
        shipmentCount: counts?.shipmentCount ?? 0,
        shopify: shop
          ? {
              connected: true,
              shopDomain: shop.shopDomain,
              lastSyncedAt: shop.lastSyncedAt,
              syncCount: shop.syncCount ?? 0,
            }
          : { connected: false },
      };
    });

  res.json({ items: out, total, page, limit });
});

export const adminGetVendor = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const v = await Vendor.findById(id).lean();
  if (!v) throw new AppError(404, "Vendor not found");
  const u = await User.findById(v.userId).select("-passwordHash").lean();
  if (!u) throw new AppError(404, "User not found");
  const wallet = await Wallet.findOne({ userId: v.userId }).lean();
  const orderCount = await Order.countDocuments({ vendorId: v._id });
  const shipmentCount = await Order.countDocuments({ vendorId: v._id, shipmentCreated: true });
  const shop = await ShopifyStoreConnection.findOne({ ownerUserId: v.userId })
    .select("shopDomain lastSyncedAt syncCount isActive lastSyncError")
    .lean();

  res.json({
    id: String(v._id),
    userId: String(v.userId),
    name: v.name,
    city: v.city,
    pin: v.pin,
    vendorStatus: v.status,
    contactPerson: v.contactPerson,
    phone: v.phone,
    email: v.email,
    user: {
      name: u.name,
      email: u.email,
      phone: u.phone,
      companyName: u.companyName,
      status: u.status,
    },
    walletBalance: wallet?.balance ?? 0,
    orderCount,
    shipmentCount,
    shopify: shop
      ? {
          connected: !!shop.isActive,
          shopDomain: shop.shopDomain,
          lastSyncedAt: shop.lastSyncedAt,
          syncCount: shop.syncCount ?? 0,
          lastSyncError: shop.lastSyncError,
        }
      : { connected: false },
  });
});

export const adminPatchVendor = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const v = await Vendor.findById(id);
  if (!v) throw new AppError(404, "Vendor not found");
  const body = req.body as { vendorStatus?: string; userStatus?: string };

  if (body.vendorStatus === "Active" || body.vendorStatus === "Inactive") {
    v.status = body.vendorStatus;
    await v.save();
  }

  if (body.userStatus === "active" || body.userStatus === "inactive" || body.userStatus === "blocked") {
    const u = await User.findById(v.userId);
    if (!u) throw new AppError(404, "User not found");
    if (u.role !== "vendor") throw new AppError(400, "Invalid user role");
    u.status = body.userStatus;
    await u.save();
  }

  res.json({ ok: true });
});

export const adminListDropshippers = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const { page, limit, skip } = parsePagination(req);
  const search = String(req.query.search ?? "").trim().toLowerCase();
  const accountStatus = String(req.query.accountStatus ?? "").trim();
  const blocked = String(req.query.blocked ?? "").trim();

  const userParts: Record<string, unknown>[] = [{ role: "dropshipper" }];
  if (accountStatus === "active" || accountStatus === "inactive") userParts.push({ status: accountStatus });
  if (blocked === "true") userParts.push({ status: "blocked" });
  else if (blocked === "false") userParts.push({ status: { $ne: "blocked" } });
  const userQuery = userParts.length > 1 ? { $and: userParts } : userParts[0];

  const users = await User.find(userQuery).select("_id name email phone companyName status").lean();
  const userIds = users.map((u) => u._id);
  let drops = await Dropshipper.find({ userId: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  let rows = drops.map((d) => ({ d, u: userMap.get(String(d.userId)) }));

  if (search) {
    rows = rows.filter(
      ({ d, u }) =>
        (u?.name && u.name.toLowerCase().includes(search)) ||
        (u?.companyName && u.companyName.toLowerCase().includes(search)) ||
        (u?.email && u.email.toLowerCase().includes(search)) ||
        (u?.phone && u.phone.includes(search))
    );
  }

  const total = rows.length;
  const slice = rows.slice(skip, skip + limit);

  const uid = (id: unknown) => id as mongoose.Types.ObjectId;
  const out = await Promise.all(
    slice.map(async ({ d, u }) => {
      const wallet = await Wallet.findOne({ userId: d.userId }).lean();
      const owner = uid(d.userId);
      const orderCount = await Order.countDocuments({
        $or: [{ ownerUserId: owner }, { dropshipperId: owner }, { createdBy: owner }],
      });
      const shipmentCount = await Order.countDocuments({
        $or: [{ ownerUserId: owner }, { dropshipperId: owner }, { createdBy: owner }],
        shipmentCreated: true,
      });
      const shop = await ShopifyStoreConnection.findOne({
        ownerUserId: d.userId,
        isActive: true,
      })
        .select("shopDomain lastSyncedAt")
        .lean();
      return {
        id: String(d._id),
        userId: String(d.userId),
        name: u?.name ?? "—",
        email: u?.email ?? "",
        phone: u?.phone ?? "",
        companyName: u?.companyName,
        accessType: d.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL",
        allowWarehouseAccess:
          typeof d.allowWarehouseAccess === "boolean"
            ? d.allowWarehouseAccess
            : d.accessType !== "RESTRICTED",
        accountStatus: u?.status,
        totalOrders: d.totalOrders,
        activeOrders: d.activeOrders,
        kycVerified: d.kycVerified,
        walletBalance: wallet?.balance ?? 0,
        orderCount,
        shipmentCount,
        joinDate: d.joinDate,
        shopify: shop
          ? { connected: true, shopDomain: shop.shopDomain, lastSyncedAt: shop.lastSyncedAt }
          : { connected: false },
      };
    })
  );

  res.json({ items: out, total, page, limit });
});

export const adminGetDropshipper = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const d = await Dropshipper.findById(id).lean();
  if (!d) throw new AppError(404, "Dropshipper not found");
  const u = await User.findById(d.userId).select("-passwordHash").lean();
  if (!u) throw new AppError(404, "User not found");
  const wallet = await Wallet.findOne({ userId: d.userId }).lean();
  const owner = d.userId as mongoose.Types.ObjectId;
  const orderCount = await Order.countDocuments({
    $or: [{ ownerUserId: owner }, { dropshipperId: owner }, { createdBy: owner }],
  });
  const shipmentCount = await Order.countDocuments({
    $or: [{ ownerUserId: owner }, { dropshipperId: owner }, { createdBy: owner }],
    shipmentCreated: true,
  });
  const shop = await ShopifyStoreConnection.findOne({ ownerUserId: d.userId })
    .select("shopDomain lastSyncedAt syncCount isActive")
    .lean();

  res.json({
    id: String(d._id),
    userId: String(d.userId),
    accessType: d.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL",
    allowWarehouseAccess:
      typeof d.allowWarehouseAccess === "boolean"
        ? d.allowWarehouseAccess
        : d.accessType !== "RESTRICTED",
    totalOrders: d.totalOrders,
    activeOrders: d.activeOrders,
    kycVerified: d.kycVerified,
    joinDate: d.joinDate,
    user: {
      name: u.name,
      email: u.email,
      phone: u.phone,
      companyName: u.companyName,
      status: u.status,
    },
    walletBalance: wallet?.balance ?? 0,
    orderCount,
    shipmentCount,
    shopify: shop
      ? {
          connected: !!shop.isActive,
          shopDomain: shop.shopDomain,
          lastSyncedAt: shop.lastSyncedAt,
          syncCount: shop.syncCount ?? 0,
        }
      : { connected: false },
  });
});

export const adminPatchDropshipper = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const d = await Dropshipper.findById(id);
  if (!d) throw new AppError(404, "Dropshipper not found");
  const body = req.body as { userStatus?: string; accessType?: string; allowWarehouseAccess?: boolean };

  if (body.userStatus === "active" || body.userStatus === "inactive" || body.userStatus === "blocked") {
    const u = await User.findById(d.userId);
    if (!u) throw new AppError(404, "User not found");
    if (u.role !== "dropshipper") throw new AppError(400, "Invalid user role");
    u.status = body.userStatus;
    await u.save();
  }

  if (body.accessType === "FULL" || body.accessType === "RESTRICTED") {
    d.accessType = body.accessType;
  }

  if (typeof body.allowWarehouseAccess === "boolean") {
    d.allowWarehouseAccess = body.allowWarehouseAccess;
  }

  await d.save();

  res.json({ ok: true });
});

function nextTicketNumber(): string {
  return `TKT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function mapSupportTicketListItem(
  t: {
    _id: unknown;
    ticketNumber: string;
    title: string;
    subject?: string;
    category?: string;
    status: string;
    priority: string;
    requesterUserId: unknown;
    assigneeUserId?: unknown | null;
    createdAt: Date;
    updatedAt: Date;
  },
  reqMap: Map<string, { name?: string; email?: string; role?: string }>
) {
  const requester = reqMap.get(String(t.requesterUserId)) ?? { name: "", email: "", role: "" };
  return {
    id: String(t._id),
    ticketNumber: t.ticketNumber,
    title: t.subject ?? t.title,
    subject: t.subject ?? t.title,
    category: t.category ?? "others",
    status: t.status,
    priority: t.priority,
    requester,
    assigneeUserId: t.assigneeUserId ? String(t.assigneeUserId) : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function parseSupportDateRange(req: { query: Record<string, unknown> }) {
  const fromRaw = String(req.query.from ?? req.query.dateFrom ?? "").trim();
  const toRaw = String(req.query.to ?? req.query.dateTo ?? "").trim();
  const range: Record<string, Date> = {};
  if (fromRaw) {
    const from = new Date(fromRaw);
    if (Number.isNaN(from.getTime())) throw new AppError(400, "Invalid from date");
    range.$gte = from;
  }
  if (toRaw) {
    const to = new Date(toRaw);
    if (Number.isNaN(to.getTime())) throw new AppError(400, "Invalid to date");
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return Object.keys(range).length ? range : undefined;
}

function normalizeSupportCategory(raw: unknown): SupportTicketCategory {
  const c = String(raw ?? "others").trim().toLowerCase();
  return (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(c)
    ? (c as SupportTicketCategory)
    : "others";
}

function parseSupportAttachments(body: Record<string, unknown>): ISupportAttachment[] {
  const raw = body.attachments;
  if (!Array.isArray(raw)) return [];
  const out: ISupportAttachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    const fileName = String(o.fileName ?? o.name ?? "attachment").trim();
    if (!url) continue;
    out.push({
      fileName: fileName.slice(0, 200),
      url: url.slice(0, 2000),
      mimeType: o.mimeType ? String(o.mimeType).slice(0, 120) : undefined,
      size: typeof o.size === "number" ? o.size : undefined,
      uploadedAt: new Date(),
    });
  }
  return out;
}

export const adminListSupportTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const { page, limit, skip } = parsePagination(req);
  const status = String(req.query.status ?? "").trim();
  const priority = String(req.query.priority ?? "").trim();
  const category = String(req.query.category ?? "").trim();
  const roleFilter = String(req.query.role ?? req.query.requesterRole ?? "").trim();
  const userQ = String(req.query.user ?? req.query.vendor ?? req.query.dropshipper ?? "").trim();
  const q: Record<string, unknown> = {};
  const validStatuses: SupportTicketStatus[] = [
    "open",
    "in_progress",
    "waiting_for_user",
    "resolved",
    "closed",
  ];
  if (status && validStatuses.includes(status as SupportTicketStatus)) q.status = status;
  if (priority && ["low", "medium", "high"].includes(priority)) q.priority = priority;
  if (category && (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(category)) {
    q.category = category;
  }
  const createdAt = parseSupportDateRange(req);
  if (createdAt) q.createdAt = createdAt;
  if (roleFilter && ["vendor", "dropshipper"].includes(roleFilter)) q.requesterRole = roleFilter;

  if (userQ) {
    const users = await User.find({
      role: { $in: ["vendor", "dropshipper", "admin"] },
      $or: [
        { name: new RegExp(userQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { email: new RegExp(userQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      ],
    })
      .select("_id")
      .lean();
    q.requesterUserId = { $in: users.map((u) => u._id) };
  }

  const [rows, total] = await Promise.all([
    SupportTicket.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SupportTicket.countDocuments(q),
  ]);

  const requesterIds = [...new Set(rows.map((r) => String(r.requesterUserId)))];
  const requesters = await User.find({ _id: { $in: requesterIds } })
    .select("name email role")
    .lean();
  const reqMap = new Map(requesters.map((u) => [String(u._id), u]));

  res.json({
    items: rows.map((t) => mapSupportTicketListItem(t, reqMap)),
    total,
    page,
    limit,
  });
});

export const adminGetSupportTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findById(id).lean();
  if (!t) throw new AppError(404, "Not found");
  const requester = await User.findById(t.requesterUserId).select("name email role phone companyName").lean();
  let assignee: { id: string; name?: string; email?: string; role?: string } | null = null;
  if (t.assigneeUserId) {
    const au = await User.findById(t.assigneeUserId).select("name email role").lean();
    if (au)
      assignee = {
        id: String(au._id),
        name: au.name,
        email: au.email,
        role: au.role,
      };
  }
  res.json({
    id: String(t._id),
    ticketNumber: t.ticketNumber,
    title: t.subject ?? t.title,
    subject: t.subject ?? t.title,
    description: t.description,
    category: t.category ?? "others",
    status: t.status,
    priority: t.priority,
    attachments: t.attachments ?? [],
    requester,
    assignee,
    comments: (t.comments || []).map((c) => ({
      userId: String(c.userId),
      body: c.body,
      isInternal: c.isInternal,
      attachments: c.attachments ?? [],
      createdAt: c.createdAt,
    })),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
});

export const adminPatchSupportTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findById(id);
  if (!t) throw new AppError(404, "Not found");
  const body = req.body as {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    assigneeUserId?: string | null;
  };

  if (body.status && ["open", "in_progress", "waiting_for_user", "resolved", "closed"].includes(body.status)) {
    t.status = body.status;
  }
  if (body.priority && ["low", "medium", "high"].includes(body.priority)) {
    t.priority = body.priority;
  }
  if (body.assigneeUserId !== undefined) {
    if (body.assigneeUserId === null || body.assigneeUserId === "") {
      t.assigneeUserId = null;
    } else if (mongoose.isValidObjectId(body.assigneeUserId)) {
      const au = await User.findById(body.assigneeUserId);
      if (!au || au.role !== "admin") throw new AppError(400, "Assignee must be an admin user");
      t.assigneeUserId = au._id as mongoose.Types.ObjectId;
    }
  }
  await t.save();

  if (req.user) {
    recordUserActivity({
      user: req.user,
      module: "support",
      action: ACTIVITY_ACTIONS.SUPPORT_TICKET_UPDATED,
      req,
      metadata: { ticketId: String(t._id), status: t.status },
    });
  }

  await createInAppNotification(
    t.requesterUserId,
    "support_update",
    `Ticket ${t.ticketNumber} updated`,
    `Status: ${t.status}. ${t.title}`,
    { ticketId: String(t._id) }
  );
  if (t.assigneeUserId) {
    await createInAppNotification(
      t.assigneeUserId,
      "support_update",
      `Ticket ${t.ticketNumber} updated`,
      t.title,
      { ticketId: String(t._id) }
    );
  }

  res.json({ ok: true });
});

export const adminAddSupportComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findById(id);
  if (!t) throw new AppError(404, "Not found");
  const body = req.body as { body?: string; isInternal?: boolean; attachments?: unknown[] };
  const text = String(body.body ?? "").trim();
  if (!text) throw new AppError(400, "body required");

  t.comments.push({
    userId: req.user._id as mongoose.Types.ObjectId,
    body: text,
    isInternal: !!body.isInternal,
    attachments: parseSupportAttachments({ attachments: body.attachments }),
    createdAt: new Date(),
  });
  if (t.status === "open") t.status = "in_progress";
  await t.save();

  if (!body.isInternal) {
    await createInAppNotification(
      t.requesterUserId,
      "support_update",
      `New reply on ${t.ticketNumber}`,
      text.slice(0, 120),
      { ticketId: String(t._id) }
    );
  }

  res.json({ ok: true });
});

/** User: create support ticket */
export const userCreateSupportTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role === "admin") throw new AppError(400, "Admins use admin support console");
  const body = req.body as {
    title?: string;
    subject?: string;
    description?: string;
    priority?: SupportTicketPriority;
    category?: string;
    attachments?: unknown[];
  };
  const subject = String(body.subject ?? body.title ?? "").trim();
  if (!subject) throw new AppError(400, "subject required");
  const description = String(body.description ?? "").trim();

  const doc = await SupportTicket.create({
    ticketNumber: nextTicketNumber(),
    requesterUserId: req.user._id,
    requesterRole: req.user.role,
    subject,
    title: subject,
    description,
    category: normalizeSupportCategory(body.category),
    status: "open",
    priority: body.priority && ["low", "medium", "high"].includes(body.priority) ? body.priority : "medium",
    attachments: parseSupportAttachments(body as Record<string, unknown>),
    comments: [],
  });

  recordUserActivity({
    user: req.user,
    module: "support",
    action: ACTIVITY_ACTIONS.SUPPORT_TICKET_CREATED,
    req,
    metadata: { ticketNumber: doc.ticketNumber, category: doc.category },
  });

  await notifyAllAdmins(
    "support_update",
    "New support ticket",
    `${subject} (${doc.ticketNumber})`,
    { ticketId: String(doc._id), ticketNumber: doc.ticketNumber }
  );

  res.status(201).json({
    id: String(doc._id),
    ticketNumber: doc.ticketNumber,
    status: doc.status,
    category: doc.category,
  });
});

export const userListMySupportTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await SupportTicket.find({ requesterUserId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((t) => ({
      id: String(t._id),
      ticketNumber: t.ticketNumber,
      title: t.subject ?? t.title,
      subject: t.subject ?? t.title,
      category: t.category ?? "others",
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  );
});

export const userGetSupportTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findOne({ _id: id, requesterUserId: req.user._id }).lean();
  if (!t) throw new AppError(404, "Not found");
  const publicComments = (t.comments || []).filter((c) => !c.isInternal);
  res.json({
    id: String(t._id),
    ticketNumber: t.ticketNumber,
    title: t.subject ?? t.title,
    subject: t.subject ?? t.title,
    description: t.description,
    category: t.category ?? "others",
    status: t.status,
    priority: t.priority,
    attachments: t.attachments ?? [],
    comments: publicComments.map((c) => ({
      userId: String(c.userId),
      body: c.body,
      attachments: c.attachments ?? [],
      createdAt: c.createdAt,
    })),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
});

export const userAddSupportComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findOne({ _id: id, requesterUserId: req.user._id });
  if (!t) throw new AppError(404, "Not found");
  if (t.status === "closed") throw new AppError(400, "Ticket is closed");
  const body = req.body as { body?: string; attachments?: unknown[] };
  const text = String(body.body ?? "").trim();
  if (!text) throw new AppError(400, "body required");

  t.comments.push({
    userId: req.user._id as mongoose.Types.ObjectId,
    body: text,
    isInternal: false,
    attachments: parseSupportAttachments({ attachments: body.attachments }),
    createdAt: new Date(),
  });
  if (t.status === "waiting_for_user" || t.status === "resolved") t.status = "in_progress";
  await t.save();

  await notifyAllAdmins("support_update", "Ticket reply", `${t.ticketNumber}: ${text.slice(0, 80)}`, {
    ticketId: String(t._id),
  });

  res.json({ ok: true });
});
