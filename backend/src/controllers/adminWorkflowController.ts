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
import { SupportTicket, type SupportTicketPriority, type SupportTicketStatus } from "../models/SupportTicket.js";
import mongoose from "mongoose";
import { createInAppNotification, notifyAllAdmins } from "../services/inAppNotifications.js";
import { randomBytes } from "crypto";
import { getFinalProductPrice, resolveShippingCharge } from "../utils/productPricing.js";
import { assertProductPermission, PRODUCT_PERMISSIONS } from "../utils/productPermissions.js";

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

  const sortParam = String(req.query.sort ?? "-createdAt");
  const sort: Record<string, 1 | -1> = {};
  if (sortParam === "name") sort.name = 1;
  else if (sortParam === "-name") sort.name = -1;
  else if (sortParam === "createdAt") sort.createdAt = 1;
  else sort.createdAt = -1;

  const [rows, total] = await Promise.all([
    Product.find(q).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(q),
  ]);

  res.json({
    items: rows.map(mapProductLean),
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
  return {
    _id: String(p._id),
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    category: p.category,
    price,
    sellingPrice: p.sellingPrice,
    shippingCharge,
    finalPrice: getFinalProductPrice(p),
    stock: p.stock,
    status: p.status,
    vendorId: p.vendorId ? String(p.vendorId) : null,
    vendorName: p.vendorName,
    uploadedBy: p.uploadedBy ? String(p.uploadedBy) : null,
    uploadedByRole: p.uploadedByRole,
    images: p.images,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const adminPatchCatalogueProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const body = req.body as Record<string, unknown>;
  const allowed = ["status", "name", "sku", "category", "price", "sellingPrice", "shippingCharge", "stock"];
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

  const users = await User.find(userQuery).select("_id name email phone companyName status").lean();
  const userIds = users.map((u) => u._id);
  let vendors = await Vendor.find({ userId: { $in: userIds } }).lean();

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

  const out = await Promise.all(
    slice.map(async ({ v, u }) => {
      const wallet = await Wallet.findOne({ userId: v.userId }).lean();
      const orderCount = await Order.countDocuments({ vendorId: v._id });
      const shipmentCount = await Order.countDocuments({ vendorId: v._id, shipmentCreated: true });
      const shop = await ShopifyStoreConnection.findOne({
        ownerUserId: v.userId,
        isActive: true,
      })
        .select("shopDomain lastSyncedAt syncCount")
        .lean();
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
        orderCount,
        shipmentCount,
        shopify: shop
          ? {
              connected: true,
              shopDomain: shop.shopDomain,
              lastSyncedAt: shop.lastSyncedAt,
              syncCount: shop.syncCount ?? 0,
            }
          : { connected: false },
      };
    })
  );

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

export const adminListSupportTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdmin(req);
  const { page, limit, skip } = parsePagination(req);
  const status = String(req.query.status ?? "").trim();
  const priority = String(req.query.priority ?? "").trim();
  const q: Record<string, unknown> = {};
  if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) q.status = status;
  if (priority && ["low", "medium", "high"].includes(priority)) q.priority = priority;

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
    items: rows.map((t) => ({
      id: String(t._id),
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      requester: reqMap.get(String(t.requesterUserId)) ?? { name: "", email: "", role: "" },
      assigneeUserId: t.assigneeUserId ? String(t.assigneeUserId) : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
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
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    requester,
    assignee,
    comments: (t.comments || []).map((c) => ({
      userId: String(c.userId),
      body: c.body,
      isInternal: c.isInternal,
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

  if (body.status && ["open", "in_progress", "resolved", "closed"].includes(body.status)) {
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
  const body = req.body as { body?: string; isInternal?: boolean };
  const text = String(body.body ?? "").trim();
  if (!text) throw new AppError(400, "body required");

  t.comments.push({
    userId: req.user._id as mongoose.Types.ObjectId,
    body: text,
    isInternal: !!body.isInternal,
    createdAt: new Date(),
  });
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
  const body = req.body as { title?: string; description?: string; priority?: SupportTicketPriority };
  const title = String(body.title ?? "").trim();
  if (!title) throw new AppError(400, "title required");
  const description = String(body.description ?? "").trim();

  const doc = await SupportTicket.create({
    ticketNumber: nextTicketNumber(),
    requesterUserId: req.user._id,
    title,
    description,
    status: "open",
    priority: body.priority && ["low", "medium", "high"].includes(body.priority) ? body.priority : "medium",
    comments: [],
  });

  await notifyAllAdmins(
    "support_update",
    "New support ticket",
    `${title} (${doc.ticketNumber})`,
    { ticketId: String(doc._id), ticketNumber: doc.ticketNumber }
  );

  res.status(201).json({
    id: String(doc._id),
    ticketNumber: doc.ticketNumber,
    status: doc.status,
  });
});

export const userListMySupportTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await SupportTicket.find({ requesterUserId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((t) => ({
      id: String(t._id),
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
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
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    comments: publicComments.map((c) => ({
      userId: String(c.userId),
      body: c.body,
      createdAt: c.createdAt,
    })),
    createdAt: t.createdAt,
  });
});

export const userAddSupportComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const t = await SupportTicket.findOne({ _id: id, requesterUserId: req.user._id });
  if (!t) throw new AppError(404, "Not found");
  if (t.status === "closed") throw new AppError(400, "Ticket is closed");
  const text = String((req.body as { body?: string }).body ?? "").trim();
  if (!text) throw new AppError(400, "body required");

  t.comments.push({
    userId: req.user._id as mongoose.Types.ObjectId,
    body: text,
    isInternal: false,
    createdAt: new Date(),
  });
  await t.save();

  await notifyAllAdmins("support_update", "Ticket reply", `${t.ticketNumber}: ${text.slice(0, 80)}`, {
    ticketId: String(t._id),
  });

  res.json({ ok: true });
});
