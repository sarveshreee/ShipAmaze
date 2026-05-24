import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import { AppError } from "./errorMiddleware.js";
import { Dropshipper, type DropshipperAccessType } from "../models/Dropshipper.js";

export type { DropshipperAccessType };

export async function getDropshipperAccessType(
  userId: unknown
): Promise<DropshipperAccessType> {
  const d = await Dropshipper.findOne({ userId }).select("accessType").lean();
  return d?.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL";
}

/** Blocks restricted dropshippers from operational APIs (warehouses, vendors, order processing). */
export const requireFullDropshipper = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const accessType = await getDropshipperAccessType(req.user._id);
  if (accessType === "RESTRICTED") {
    return next(new AppError(403, "Your account has restricted access. Contact admin for full access."));
  }
  return next();
};
