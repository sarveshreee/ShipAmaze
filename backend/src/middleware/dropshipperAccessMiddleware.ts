import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./authMiddleware.js";
import { AppError } from "./errorMiddleware.js";
import { Dropshipper, type DropshipperAccessType } from "../models/Dropshipper.js";

export type { DropshipperAccessType };

export type DropshipperAccessState = {
  accessType: DropshipperAccessType;
  allowWarehouseAccess: boolean;
};

export async function getDropshipperAccessState(userId: unknown): Promise<DropshipperAccessState> {
  const d = await Dropshipper.findOne({ userId }).select("accessType allowWarehouseAccess").lean();
  const accessType = d?.accessType === "RESTRICTED" ? "RESTRICTED" : "FULL";
  const allowWarehouseAccess =
    typeof d?.allowWarehouseAccess === "boolean" ? d.allowWarehouseAccess : accessType !== "RESTRICTED";
  return { accessType, allowWarehouseAccess };
}

export async function getDropshipperAccessType(userId: unknown): Promise<DropshipperAccessType> {
  const state = await getDropshipperAccessState(userId);
  return state.accessType;
}

export async function getDropshipperWarehouseAccess(userId: unknown): Promise<boolean> {
  const state = await getDropshipperAccessState(userId);
  return state.allowWarehouseAccess;
}

/** Blocks restricted dropshippers from operational APIs (warehouses, vendors, order processing). */
export const requireFullDropshipper = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const { accessType } = await getDropshipperAccessState(req.user._id);
  if (accessType === "RESTRICTED") {
    return next(new AppError(403, "Your account has restricted access. Contact admin for full access."));
  }
  return next();
};

/** Blocks dropshippers from warehouse/vendor APIs when ALLOW_WAREHOUSE_ACCESS is OFF. */
export const requireDropshipperWarehouseAccess = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) return next(new AppError(401, "Unauthorized"));
  if (req.user.role !== "dropshipper") return next();
  const allowed = await getDropshipperWarehouseAccess(req.user._id);
  if (!allowed) {
    return next(new AppError(403, "Warehouse and vendor access is disabled for this dropshipper."));
  }
  return next();
};
