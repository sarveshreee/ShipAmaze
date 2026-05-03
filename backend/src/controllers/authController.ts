import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";
import { Profile } from "../models/Profile.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { Wallet } from "../models/Wallet.js";
import { signToken } from "../utils/jwt.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["admin", "vendor", "dropshipper"]),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function toPublicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  companyName: string;
  phone?: string;
}) {
  const profile = await Profile.findOne({ userId: user._id }).lean();
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    companyName: user.companyName,
    phone: user.phone ?? "",
    address: profile?.address ?? "",
    avatarUrl:
      profile?.avatarUrl && String(profile.avatarUrl).trim() ? String(profile.avatarUrl).trim() : null,
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  const exists = await User.findOne({ email: body.email });
  if (exists) throw new AppError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash,
    role: body.role,
    companyName: body.companyName ?? "",
    phone: body.phone ?? "",
    permissions: [],
  });

  await Profile.create({ userId: user._id });
  await Wallet.create({ userId: user._id, balance: 0 });

  if (body.role === "vendor") {
    await Vendor.create({
      userId: user._id,
      name: body.companyName || body.name,
      city: "",
      pin: "",
      assignedVendors: 0,
      ordersToday: 0,
      status: "Active",
    });
  } else if (body.role === "dropshipper") {
    await Dropshipper.create({
      userId: user._id,
      totalOrders: 0,
      activeOrders: 0,
      kycVerified: false,
      joinDate: new Date(),
    });
  }

  const token = signToken({ sub: String(user._id), role: user.role });
  const publicUser = await toPublicUser(user);
  res.status(201).json({ user: publicUser, token });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user) throw new AppError(401, "Invalid email or password");

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) throw new AppError(401, "Invalid email or password");

  const token = signToken({ sub: String(user._id), role: user.role });
  const publicUser = await toPublicUser(user);
  res.json({ user: publicUser, token });
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  res.json({ user: await toPublicUser(req.user) });
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  avatarUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.body && typeof req.body === "object") {
    if ("email" in req.body || "role" in req.body) {
      throw new AppError(400, "Cannot update email or role");
    }
  }
  const body = profileUpdateSchema.parse(req.body ?? {});
  if (body.name !== undefined) req.user.name = body.name.trim();
  if (body.phone !== undefined) req.user.phone = body.phone.trim();
  if (body.companyName !== undefined) req.user.companyName = body.companyName.trim();
  await req.user.save();

  if (body.address !== undefined || body.avatarUrl !== undefined) {
    const $set: Record<string, string> = {};
    const $unset: Record<string, 1> = {};
    if (body.address !== undefined) $set.address = body.address.trim();
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl === null || body.avatarUrl === "") $unset.avatarUrl = 1;
      else $set.avatarUrl = body.avatarUrl;
    }
    await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { upsert: true, new: true }
    );
  }

  res.json({ user: await toPublicUser(req.user) });
});

export const logout = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = changePasswordSchema.parse(req.body);
  const ok = await bcrypt.compare(body.currentPassword, req.user.passwordHash);
  if (!ok) throw new AppError(400, "Current password is incorrect");
  req.user.passwordHash = await bcrypt.hash(body.newPassword, 10);
  await req.user.save();
  res.json({ ok: true });
});
