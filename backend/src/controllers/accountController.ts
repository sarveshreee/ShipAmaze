import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { KycProfile } from "../models/KycProfile.js";
import { BankAccount } from "../models/BankAccount.js";
import { RoutingSetting } from "../models/RoutingSetting.js";
import { TeamMember } from "../models/TeamMember.js";
import { Vendor } from "../models/Vendor.js";

export const getKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const k = await KycProfile.findOne({ userId: req.user._id }).lean();
  res.json(k?.data ?? {});
});

export const putKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await KycProfile.findOneAndUpdate(
    { userId: req.user._id },
    { userId: req.user._id, data: req.body },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

export const listBanks = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await BankAccount.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(
    rows.map((b) => ({
      id: String(b._id),
      accountHolder: b.accountHolder,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      ifsc: b.ifsc,
      isPrimary: b.isPrimary,
      status: b.status,
      verified_at: b.verifiedAt,
    }))
  );
});

export const createBank = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await BankAccount.create({ ...req.body, userId: req.user._id });
  res.status(201).json(doc);
});

export const updateBank = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await BankAccount.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  );
  if (!doc) throw new AppError(404, "Not found");
  res.json(doc);
});

export const deleteBank = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await BankAccount.deleteOne({ _id: req.params.id, userId: req.user._id });
  res.json({ ok: true });
});

export const getRouting = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const r = await RoutingSetting.findOne({ userId: req.user._id }).lean();
  const vendors = await Vendor.find().select("name _id").lean();
  const vendorOptions = vendors.map((v) => ({ id: String(v._id), name: v.name }));
  res.json({ settings: r?.rules ?? {}, preferredVendorId: r?.preferredVendorId, vendorOptions });
});

export const putRouting = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await RoutingSetting.findOneAndUpdate(
    { userId: req.user._id },
    {
      userId: req.user._id,
      preferredVendorId: req.body.preferredVendorId
        ? new mongoose.Types.ObjectId(String(req.body.preferredVendorId))
        : undefined,
      rules: req.body.rules ?? {},
    },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

export const listTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rows = await TeamMember.find({ ownerUserId: req.user._id }).sort({ invitedAt: -1 }).lean();
  res.json(
    rows.map((t) => ({
      id: String(t._id),
      email: t.email,
      role: t.role,
      invited_at: t.invitedAt,
      last_resent_at: t.lastResentAt,
    }))
  );
});

export const createTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await TeamMember.create({
    ownerUserId: req.user._id,
    email: req.body.email,
    role: req.body.role || "member",
    invitedAt: new Date(),
  });
  res.status(201).json(doc);
});

export const deleteTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await TeamMember.deleteOne({ _id: req.params.id, ownerUserId: req.user._id });
  res.json({ ok: true });
});

export const resendTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await TeamMember.findOneAndUpdate(
    { _id: req.params.id, ownerUserId: req.user._id },
    { lastResentAt: new Date() }
  );
  res.json({ ok: true });
});
