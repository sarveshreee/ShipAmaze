import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { adminAdjustWallet, debitWallet } from "../services/walletLedger.js";
import type { WalletReferenceType } from "../models/Transaction.js";

const REF_TYPES = new Set<string>(["recharge", "order", "shipment", "cod", "adjustment", "refund", "manual_test"]);

function parsePage(q: Record<string, unknown>): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(String(q.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? "25"), 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export const adminListWallets = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const wallets = await Wallet.find().populate("userId", "name email role companyName").sort({ updatedAt: -1 }).lean();

  res.json({
    success: true,
    data: wallets.map((w) => {
      const udoc = w.userId as unknown;
      const uidStr =
        typeof udoc === "object" && udoc !== null && "_id" in (udoc as object)
          ? String((udoc as { _id: mongoose.Types.ObjectId })._id)
          : String(udoc ?? "");
      const u = udoc as { name?: string; email?: string; role?: string; companyName?: string } | null;
      return {
        userId: uidStr,
        name: u?.name ?? "",
        email: u?.email ?? "",
        role: u?.role ?? "",
        companyName: u?.companyName ?? "",
        balance: w.balance ?? 0,
        currency: w.currency ?? "INR",
        updatedAt: w.updatedAt,
      };
    }),
  });
});

export const adminAdjustWalletHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");

  const body = req.body as { amount?: unknown; reason?: unknown };
  const signed = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const reason = String(body.reason ?? "").trim();

  const target = await User.findById(userId).select("_id").lean();
  if (!target) throw new AppError(404, "User not found");

  const r = await adminAdjustWallet({
    targetUserId: new mongoose.Types.ObjectId(userId),
    signedAmount: signed,
    reason,
    adminUserId: req.user._id,
  });

  const { createInAppNotification } = await import("../services/inAppNotifications.js");
  await createInAppNotification(
    new mongoose.Types.ObjectId(userId),
    "wallet_recharge",
    signed >= 0 ? "Wallet credit applied" : "Wallet adjustment",
    reason || `Balance change: ${signed >= 0 ? "+" : ""}₹${signed}`,
    { txnId: r.txnId, signedAmount: signed }
  );

  res.json({
    success: true,
    message: "Wallet adjusted",
    data: { balanceAfter: r.balanceAfter, txnId: r.txnId },
  });
});

/** Admin-only manual debit (rare); credits should prefer PATCH .../adjust with positive amount. */
export const adminDeductWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  const body = req.body as {
    userId?: unknown;
    amount?: unknown;
    referenceType?: unknown;
    referenceId?: unknown;
    reason?: unknown;
  };
  const uid = String(body.userId ?? "").trim();
  if (!mongoose.isValidObjectId(uid)) throw new AppError(400, "userId is required");
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const referenceType = String(body.referenceType ?? "order").trim();
  if (!REF_TYPES.has(referenceType)) throw new AppError(400, "Invalid referenceType");
  const referenceId = String(body.referenceId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!referenceId) throw new AppError(400, "referenceId is required");
  if (reason.length < 3) throw new AppError(400, "reason must be at least 3 characters");

  const target = await User.findById(uid).select("_id").lean();
  if (!target) throw new AppError(404, "User not found");

  const r = await debitWallet({
    userId: new mongoose.Types.ObjectId(uid),
    amount,
    description: `Admin debit — ${reason}`,
    ledgerType: "admin_manual_debit",
    referenceType: referenceType as WalletReferenceType,
    referenceId: `admin-deduct:${referenceId}`,
    reason: `${reason} (admin ${String(req.user._id)})`,
  });

  res.status(201).json({ success: true, data: { balanceAfter: r.balanceAfter, txnId: r.txnId } });
});

export const adminListWalletTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");

  const q = req.query as Record<string, unknown>;
  const { page, pageSize, skip } = parsePage(q);
  const filter: Record<string, unknown> = {};
  const uid = String(q.userId ?? "").trim();
  if (uid && mongoose.isValidObjectId(uid)) filter.userId = new mongoose.Types.ObjectId(uid);

  const type = String(q.type ?? "").trim();
  if (type === "Credit" || type === "Debit") filter.type = type;

  const status = String(q.status ?? "").trim();
  if (status === "completed" || status === "pending" || status === "failed") filter.status = status;

  const from = String(q.dateFrom ?? "").trim();
  const to = String(q.dateTo ?? "").trim();
  if (from || to) {
    const range: Record<string, unknown> = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        range.$lte = d;
      }
    }
    if (Object.keys(range).length) filter.createdAt = range;
  }

  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: rows.map((t) => ({
      id: t.txnId,
      userId: String(t.userId),
      date: t.date,
      description: t.description,
      txnId: t.txnId,
      type: t.type,
      amount: t.amount,
      balance: t.balance,
      balanceBefore: t.balanceBefore,
      status: t.status ?? "completed",
      ledgerType: t.ledgerType ?? "general",
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      reason: t.reason,
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : undefined,
    })),
    page,
    pageSize,
    total,
  });
});
