import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { ProfitCalculatorSetting } from "../models/ProfitCalculatorSetting.js";

const GLOBAL_KEY = "global";

const DEFAULTS = {
  rtoChargePerOrder: 0,
  shippingChargePerOrder: 85,
};

function numField(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function toDto(doc?: Record<string, unknown> | null) {
  const d = doc ?? {};
  return {
    rtoChargePerOrder: numField(d.rtoChargePerOrder, DEFAULTS.rtoChargePerOrder),
    shippingChargePerOrder: numField(d.shippingChargePerOrder, DEFAULTS.shippingChargePerOrder),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : undefined,
  };
}

export const getProfitCalculatorSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const doc = await ProfitCalculatorSetting.findOne({ key: GLOBAL_KEY }).lean();
  res.json(toDto(doc ?? {}));
});

export const putProfitCalculatorSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "admin") throw new AppError(403, "Admin only");

  const b = req.body as Record<string, unknown>;
  const payload = {
    rtoChargePerOrder: numField(b.rtoChargePerOrder, DEFAULTS.rtoChargePerOrder),
    shippingChargePerOrder: numField(b.shippingChargePerOrder, DEFAULTS.shippingChargePerOrder),
  };

  const doc = await ProfitCalculatorSetting.findOneAndUpdate(
    { key: GLOBAL_KEY },
    { $set: { key: GLOBAL_KEY, ...payload } },
    { upsert: true, new: true }
  ).lean();

  res.json(toDto(doc ?? payload));
});
